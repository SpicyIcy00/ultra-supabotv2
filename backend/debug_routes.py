from app.main import app
import sys

# Print all routes
print("Registered Routes:")
for route in app.routes:
    if hasattr(route, "path"):
        print(route.path)
    elif hasattr(route, "path_format"):
        print(route.path_format)
