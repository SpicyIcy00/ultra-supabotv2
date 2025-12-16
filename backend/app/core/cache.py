"""
Redis caching utilities for the BI Dashboard API.
Provides decorators and helpers for caching expensive queries.
"""
import json
import functools
from typing import Optional, Callable, Any
from datetime import timedelta
import redis.asyncio as redis
from app.core.config import settings


# Redis client instance
_redis_client: Optional[redis.Redis] = None


async def get_redis() -> redis.Redis:
    """Get Redis client instance."""
    global _redis_client

    if _redis_client is None:
        _redis_client = redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True
        )

    return _redis_client


async def close_redis():
    """Close Redis connection."""
    global _redis_client

    if _redis_client:
        await _redis_client.close()
        _redis_client = None


def cache_key(*args, **kwargs) -> str:
    """
    Generate cache key from function arguments.
    Normalizes lists to ensure consistent cache keys regardless of order.

    Args:
        *args: Positional arguments
        **kwargs: Keyword arguments

    Returns:
        Cache key string
    """
    # Convert args and kwargs to a stable string representation
    parts = []

    for arg in args:
        if hasattr(arg, '__dict__'):
            # Skip self/cls arguments
            continue
        # Normalize lists by sorting them
        if isinstance(arg, list):
            arg = sorted(arg) if arg else []
        parts.append(str(arg))

    for key, value in sorted(kwargs.items()):
        # Normalize lists by sorting them
        if isinstance(value, list):
            value = sorted(value) if value else []
        parts.append(f"{key}={value}")

    return ":".join(parts)


def cached(
    expire: int = 300,
    prefix: str = "cache",
    key_builder: Optional[Callable] = None
) -> Callable:
    """
    Decorator to cache function results in Redis.

    Args:
        expire: Expiration time in seconds (default: 300 = 5 minutes)
        prefix: Cache key prefix (default: "cache")
        key_builder: Custom function to build cache key (optional)

    Usage:
        @cached(expire=300, prefix="analytics")
        async def get_sales_data(start_date, end_date):
            # expensive query
            return data

    Example:
        # First call: executes query and caches result
        data = await get_sales_data("2025-01-01", "2025-01-31")

        # Second call: returns cached result
        data = await get_sales_data("2025-01-01", "2025-01-31")
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            # If Redis is disabled, just execute the function
            if not settings.REDIS_ENABLED:
                return await func(*args, **kwargs)

            # Build cache key
            if key_builder:
                key_suffix = key_builder(*args, **kwargs)
            else:
                key_suffix = cache_key(*args, **kwargs)

            full_key = f"{prefix}:{func.__name__}:{key_suffix}"

            try:
                # Try to get from cache
                redis_client = await get_redis()
                cached_value = await redis_client.get(full_key)

                if cached_value:
                    # Cache hit - return cached value
                    return json.loads(cached_value)

                # Cache miss - execute function
                result = await func(*args, **kwargs)

                # Store in cache
                await redis_client.setex(
                    full_key,
                    expire,
                    json.dumps(result, default=str)
                )

                return result

            except redis.RedisError as e:
                # If Redis fails, just execute the function without caching
                print(f"Redis error: {e}. Executing without cache.")
                return await func(*args, **kwargs)

        return wrapper
    return decorator


async def invalidate_cache(pattern: str) -> int:
    """
    Invalidate cache keys matching a pattern.

    Args:
        pattern: Pattern to match keys (e.g., "analytics:*")

    Returns:
        Number of keys deleted

    Example:
        # Invalidate all analytics caches
        await invalidate_cache("analytics:*")

        # Invalidate specific function cache
        await invalidate_cache("cache:get_sales_by_hour:*")
    """
    try:
        redis_client = await get_redis()
        keys = await redis_client.keys(pattern)

        if keys:
            return await redis_client.delete(*keys)

        return 0

    except redis.RedisError as e:
        print(f"Redis error during invalidation: {e}")
        return 0


async def set_cache(key: str, value: Any, expire: int = 300) -> bool:
    """
    Manually set a cache value.

    Args:
        key: Cache key
        value: Value to cache (will be JSON serialized)
        expire: Expiration in seconds

    Returns:
        True if successful, False otherwise
    """
    try:
        redis_client = await get_redis()
        await redis_client.setex(
            key,
            expire,
            json.dumps(value, default=str)
        )
        return True

    except redis.RedisError as e:
        print(f"Redis error: {e}")
        return False


async def get_cache(key: str) -> Optional[Any]:
    """
    Manually get a cache value.

    Args:
        key: Cache key

    Returns:
        Cached value or None if not found
    """
    try:
        redis_client = await get_redis()
        cached_value = await redis_client.get(key)

        if cached_value:
            return json.loads(cached_value)

        return None

    except redis.RedisError as e:
        print(f"Redis error: {e}")
        return None


async def health_check() -> bool:
    """
    Check if Redis is healthy.

    Returns:
        True if Redis is responding, False otherwise
    """
    try:
        redis_client = await get_redis()
        return await redis_client.ping()

    except redis.RedisError:
        return False
