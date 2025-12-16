# 🧪 Dashboard Testing Guide

Both the backend and frontend are currently running! Here's how to test everything.

---

## ✅ Step 1: Verify Servers Are Running

### Backend API
**URL**: http://localhost:8000

**Check health:**
```bash
curl http://localhost:8000/api/v1/analytics/kpi-metrics
```

Expected: JSON response with KPI data

**API Documentation:**
Open in browser: http://localhost:8000/docs
- You should see Swagger UI with all 5 analytics endpoints
- Try the "Try it out" button on any endpoint

### Frontend Dashboard
**URL**: http://localhost:5173

**What you should see:**
- Dark theme dashboard (#0e1117 background)
- Sidebar with navigation
- Header with date range picker
- 4 KPI cards at the top
- Multiple charts loading

---

## 📊 Step 2: Test the Dashboard Features

### 2.1 Check KPI Cards (Top of Page)

You should see **4 cards** with real data:

1. **Total Sales**
   - Current value in PHP
   - Previous day comparison
   - Green/red growth arrow
   - Growth percentage

2. **Transactions**
   - Number of transactions
   - Growth indicator
   - Transaction count trend

3. **Avg Transaction Value**
   - Average in PHP
   - Day-over-day change

4. **Growth Rate**
   - Overall growth percentage
   - Colored based on positive/negative

**✅ Test**: Cards should show actual data from your Supabase database

### 2.2 Test Charts

#### Hourly Sales Chart (Top Left)
- **Type**: Bar chart
- **Data**: Sales by hour (9 AM - 10 PM)
- **Features**:
  - Hover tooltips with exact values
  - Blue gradient bars
  - Total sales summary below chart

**✅ Test**: Hover over bars to see detailed tooltips

#### Store Performance Chart (Top Right)
- **Type**: Horizontal bar chart
- **Data**: Top stores by revenue
- **Features**:
  - Color-coded bars
  - Stores sorted by sales
  - Shows store names

**✅ Test**: Should show Opus, Rockwell, Greenhills, etc.

#### Daily Trend Chart (Middle, Full Width)
- **Type**: Area chart
- **Data**: 30 days of sales
- **Features**:
  - Daily sales line (solid blue)
  - Cumulative sales line (dashed purple)
  - Gradient fill
  - Summary stats below

**✅ Test**: Hover to see daily and cumulative values

#### Product Performance Chart (Bottom, Full Width)
- **Type**: Bar chart
- **Data**: Top 10 products by revenue
- **Features**:
  - Product names (truncated if long)
  - Color-coded bars
  - Detailed tooltip with SKU, category, quantity

**✅ Test**: Should show "Aji Mix" as top product

### 2.3 Test Filters

#### Date Range Picker (Header)
1. Click on the "From" date input
2. Select a different date
3. **Expected**: Charts should reload with new data
4. **Check**: Browser console for API calls

#### Sidebar Navigation
1. Click "Analytics" in sidebar
2. **Expected**: Shows placeholder page
3. Click "Dashboard" to return
4. **Expected**: Charts reload

#### Reset Filters Button
1. Change the date range
2. Click "Reset Filters" at bottom of sidebar
3. **Expected**: Date range resets to last 7 days

**✅ Test**: Filters persist after page refresh (localStorage)

---

## 🔍 Step 3: Browser DevTools Testing

### Open Browser Console
Press `F12` or right-click → Inspect

### Check Network Tab
1. Reload the page (Ctrl+R)
2. Filter by "Fetch/XHR"
3. **You should see**:
   - `/api/v1/analytics/kpi-metrics` - Status 200
   - `/api/v1/analytics/sales-by-hour` - Status 200
   - `/api/v1/analytics/store-performance` - Status 200
   - `/api/v1/analytics/daily-trend` - Status 200
   - `/api/v1/analytics/product-performance` - Status 200

4. Click on any request
5. **Preview tab**: See the JSON response
6. **Response tab**: Verify data structure

**✅ Expected**: All requests return 200 OK with data

### Check Console Tab
Look for:
- ❌ **No errors** (red text)
- ✅ TanStack Query logs (if enabled)
- ✅ React DevTools available

### Check Application Tab
1. Go to Application → Local Storage
2. Open `http://localhost:5173`
3. **You should see**:
   - `dashboard-filters` - Your saved filters

**✅ Test**: Change date range, refresh page, filters should persist

---

## 🎯 Step 4: Manual API Testing

### Using Swagger UI (Easiest)

1. Open: http://localhost:8000/docs
2. Click on **GET /api/v1/analytics/sales-by-hour**
3. Click "Try it out"
4. Enter parameters:
   ```
   start_date: 2025-10-13T00:00:00
   end_date: 2025-10-19T23:59:59
   store_id: 68c5bb269da1d500073690c2
   ```
5. Click "Execute"
6. **Expected**: 200 response with hourly sales data

Repeat for all 5 endpoints!

### Using cURL (Command Line)

```bash
# Test KPI Metrics
curl http://localhost:8000/api/v1/analytics/kpi-metrics

# Test Sales by Hour
curl "http://localhost:8000/api/v1/analytics/sales-by-hour?start_date=2025-10-13T00:00:00&end_date=2025-10-19T23:59:59"

# Test with Store Filter
curl "http://localhost:8000/api/v1/analytics/sales-by-hour?start_date=2025-10-13T00:00:00&end_date=2025-10-19T23:59:59&store_id=68c5bb269da1d500073690c2"

# Test Store Performance
curl "http://localhost:8000/api/v1/analytics/store-performance?start_date=2025-10-13T00:00:00&end_date=2025-10-19T23:59:59&limit=10"

# Test Daily Trend
curl "http://localhost:8000/api/v1/analytics/daily-trend?days=30"

# Test Product Performance
curl "http://localhost:8000/api/v1/analytics/product-performance?start_date=2025-10-13T00:00:00&end_date=2025-10-19T23:59:59&limit=20"
```

### Using Python Script

```bash
cd backend
poetry run python test_all_endpoints.py
```

**Expected Output**:
```
Total Tests: 7
Passed: 7
Failed: 0
Errors: 0

All tests passed!
OVERALL STATUS: ALL ENDPOINTS WORKING
```

---

## 🐛 Step 5: Error Testing

### Test Loading States
1. Throttle network to "Slow 3G" in DevTools
2. Reload the page
3. **Expected**:
   - Skeleton loaders appear
   - Spinning indicators on charts
   - Smooth transitions when data loads

### Test Error States
1. Stop the backend server (Ctrl+C in backend terminal)
2. Reload the frontend
3. **Expected**:
   - Red error boxes appear
   - Error messages shown
   - "Error loading data" text

### Test with Different Date Ranges
Try these date ranges:

1. **Last 7 days**:
   - From: 7 days ago
   - To: Today
   - Expected: Full data

2. **Future dates**:
   - From: Tomorrow
   - To: Next week
   - Expected: No data, empty charts

3. **Single day**:
   - From: 2025-10-19
   - To: 2025-10-19
   - Expected: One day of data

---

## 📱 Step 6: Responsive Testing

### Desktop (Default)
- 4 KPI cards in a row
- 2 charts side by side
- Full sidebar visible

### Tablet (Resize browser to ~800px)
- 2 KPI cards per row
- 1 chart per row
- Sidebar collapses

### Mobile (Resize to ~400px)
- 1 KPI card per row
- 1 chart per row
- Hamburger menu

**✅ Test**: Resize browser window and watch layout adapt

---

## 🎨 Step 7: Visual Testing

### Check Theme
- Background should be very dark (#0e1117)
- Cards should have subtle transparency
- Borders should be gray (#374151)
- Text should be white/gray
- Gradients should be blue → purple

### Check Animations
- Hover over KPI cards - should lift slightly
- Hover over chart bars - should show tooltip
- Loading states should have smooth animations
- Page transitions should be smooth

### Check Typography
- Headers should be bold
- Numbers should be clear
- Currency should use PHP symbol
- Numbers should have commas

---

## 🔄 Step 8: Data Refresh Testing

### Auto Refresh on Window Focus
1. Switch to another browser tab
2. Wait 10 seconds
3. Switch back to dashboard tab
4. **Expected**: TanStack Query refetches data

### Manual Refresh
1. Click browser refresh (Ctrl+R)
2. **Expected**:
   - Page reloads
   - Date filters persist
   - All charts reload with data

### Cache Testing
1. Load the dashboard
2. Note the data
3. Immediately refresh (within 5 minutes)
4. **Expected**: Data loads from cache (instant)
5. Wait 6 minutes
6. Refresh
7. **Expected**: New API calls made (stale time exceeded)

---

## 📊 Step 9: Real Data Verification

### Compare with Backend Test Results
Run the backend test:
```bash
cd backend
poetry run python test_all_endpoints.py
```

The dashboard should show the **same data** as the test output:
- Total sales matches
- Store order matches
- Product rankings match
- Date ranges match

### Check Specific Values
From the test results (Oct 13-19):
- Total Sales: PHP 2,133,681.42 ✅
- Top Store: Opus (33.5%) ✅
- Peak Hour: 4 PM ✅
- Top Product: Aji Mix ✅

---

## ✅ Checklist

Mark these as you test:

### Basic Functionality
- [ ] Frontend loads at http://localhost:5173
- [ ] Backend API responds at http://localhost:8000
- [ ] Swagger docs work at http://localhost:8000/docs
- [ ] No console errors in browser

### Dashboard Components
- [ ] 4 KPI cards display with data
- [ ] Hourly sales chart renders
- [ ] Store performance chart renders
- [ ] Daily trend chart renders
- [ ] Product performance chart renders

### Interactivity
- [ ] Date range picker works
- [ ] Filters change the data
- [ ] Tooltips show on hover
- [ ] Navigation works
- [ ] Reset button works

### Data Accuracy
- [ ] All API calls return 200
- [ ] Data matches backend tests
- [ ] Charts show correct values
- [ ] Percentages calculate correctly

### Error Handling
- [ ] Loading states appear
- [ ] Error states display properly
- [ ] Retry logic works

### Performance
- [ ] Charts load quickly
- [ ] No lag when interacting
- [ ] Caching works
- [ ] Filters persist

---

## 🚨 Common Issues & Solutions

### Charts Not Showing
**Symptom**: White/empty space where charts should be
**Fix**:
1. Check browser console for errors
2. Verify API is returning data
3. Check Network tab for 200 responses

### "Cannot connect to API"
**Symptom**: Red error boxes everywhere
**Fix**:
1. Verify backend is running: `curl http://localhost:8000/api/v1/analytics/kpi-metrics`
2. Check `.env` file has correct API URL
3. Check CORS settings in backend

### Dates Not Filtering
**Symptom**: Changing dates doesn't update charts
**Fix**:
1. Check browser console for API calls
2. Verify date format is ISO 8601
3. Check TanStack Query DevTools

### Loading Forever
**Symptom**: Spinning indicators never stop
**Fix**:
1. Check Network tab for failed requests
2. Look for CORS errors
3. Verify database connection in backend

---

## 📸 Screenshots to Take

To verify everything works, take screenshots of:

1. **Full Dashboard** - All charts visible
2. **Hover State** - Tooltip showing on chart
3. **Date Picker** - Open state
4. **Network Tab** - All 200 responses
5. **Mobile View** - Responsive layout

---

## 🎉 Success Criteria

Your dashboard is working correctly if:

✅ All 5 API endpoints return data
✅ All 4 KPI cards show metrics
✅ All 4 charts render with data
✅ Date filters work and persist
✅ No errors in browser console
✅ Hover tooltips work
✅ Data matches backend test results
✅ Responsive design works
✅ Loading states appear
✅ Theme looks professional

---

**Ready to test!** Open http://localhost:5173 and go through each section! 🚀
