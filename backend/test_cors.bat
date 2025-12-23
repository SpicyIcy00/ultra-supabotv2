@echo off
REM test_cors.bat
REM Run this script to verify CORS headers are returned correctly.
REM Make sure the backend is running on http://localhost:8000

set TARGET_URL=http://localhost:8000/api/v1/reports/product-sales
set ORIGIN_1=https://ultra-supabotv2-8iqmvzzur-spicyicy00s-projects.vercel.app
set ORIGIN_REGEX=https://ultra-supabotv2-any-preview-hash.vercel.app

echo ---------------------------------------------------
echo Testing Specific Origin: %ORIGIN_1%
echo Target: %TARGET_URL%
echo ---------------------------------------------------
curl -I -X OPTIONS -H "Origin: %ORIGIN_1%" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: Authorization, Content-Type" %TARGET_URL%

echo.
echo ---------------------------------------------------
echo Testing Regex Origin: %ORIGIN_REGEX%
echo Target: %TARGET_URL%
echo ---------------------------------------------------
curl -I -X OPTIONS -H "Origin: %ORIGIN_REGEX%" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: Authorization, Content-Type" %TARGET_URL%
