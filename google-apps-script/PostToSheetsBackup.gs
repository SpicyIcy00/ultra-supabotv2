/**
 * Google Apps Script Web App – Replenishment BACKUP Sheet
 * Based on the original PostToSheets script structure.
 *
 * Writes all 25 replenishment fields to the backup spreadsheet.
 * Column order mirrors the dashboard + extra fields for full backup.
 *
 * Deploy inside "New weekly store reports (BACKUP)" Google Spreadsheet.
 * Set deployment URL as GOOGLE_SHEETS_BACKUP_URL in Railway.
 */

const CONFIG = {
  SHEET_NAME: 'Sheet1',
  HEADER_ROW: 1,       // Headers in row 1
  DATA_START_ROW: 2,   // Data starts at row 2
  START_COLUMN: 1      // Column A
};

const BACKUP_HEADERS = [
  'Store', 'Product Name', 'SKU', 'Product ID', 'Category',
  'Total Sold', 'Dead Days', 'Avg Daily Sales', 'Season Adj Daily',
  'Safety Stock', 'Min Level', 'Max Level', 'Expiry Cap', 'Final Max',
  'Store Inv', 'On Order', 'Inv Position', 'WH Inv',
  'Ordered Qty', 'Allocated Qty', 'Days of Stock', 'Priority Score',
  'Vel ×', 'Cat ×', 'Eff ×'
];

const NUM_COLS = BACKUP_HEADERS.length; // 25

function doGet(e) {
  return createJsonResponse({
    status: 'success',
    message: 'Replenishment Backup API is running',
    timestamp: new Date().toISOString()
  });
}

function doPost(e) {
  try {
    const requestData = JSON.parse(e.postData.contents);

    if (!requestData.data || !Array.isArray(requestData.data)) {
      return createJsonResponse({
        status: 'error',
        message: 'Invalid data format. Expected { data: [...] }'
      });
    }

    const reportData = requestData.data;
    if (reportData.length === 0) {
      return createJsonResponse({ status: 'error', message: 'No data to write' });
    }

    const sheetName = requestData.sheetName || CONFIG.SHEET_NAME;

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = spreadsheet.getSheetByName(sheetName);

    // Auto-create the tab if it doesn't exist
    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetName);
    }

    const lastRow = sheet.getLastRow();

    // Clear all 25 columns from row 1 onwards
    if (lastRow >= CONFIG.HEADER_ROW) {
      const numRows = lastRow - CONFIG.HEADER_ROW + 1;
      sheet.getRange(CONFIG.HEADER_ROW, CONFIG.START_COLUMN, numRows, NUM_COLS).clearContent();
    }

    // Build data rows — same key order as transformReplenishmentForBackup in sheetsMapping.ts
    const dataRows = reportData.map(row => [
      row.store_name             || '',
      row.product_name           || '',
      row.sku                    || '',
      row.product_id             || '',
      row.category               || '',
      row.total_sold_qty         || 0,
      row.dead_days              || 0,
      row.avg_daily_sales        || 0,
      row.season_adj_daily_sales || 0,
      row.safety_stock           || 0,
      row.min_level              || 0,
      row.max_level              || 0,
      row.expiry_cap             || 0,
      row.final_max              || 0,
      row.store_inv              || 0,
      row.on_order               || 0,
      row.inv_position           || 0,
      row.wh_on_hand             || 0,
      row.ordered_qty            || 0,
      row.allocated_qty          || 0,
      row.days_of_stock          || 0,
      row.priority_score         || 0,
      row.velocity_mult          || 0,
      row.category_mult          || 0,
      row.effective_mult         || 0,
    ]);

    // Write headers to row 1
    sheet.getRange(CONFIG.HEADER_ROW, CONFIG.START_COLUMN, 1, NUM_COLS)
      .setValues([BACKUP_HEADERS]);

    // Write data starting at row 2
    if (dataRows.length > 0) {
      sheet.getRange(CONFIG.DATA_START_ROW, CONFIG.START_COLUMN, dataRows.length, NUM_COLS)
        .setValues(dataRows);

      // Number formatting
      const dr = CONFIG.DATA_START_ROW;
      const n  = dataRows.length;
      sheet.getRange(dr, 6,  n, 2).setNumberFormat('0');        // Total Sold, Dead Days
      sheet.getRange(dr, 8,  n, 5).setNumberFormat('0.00');     // Avg Daily → Max Level
      sheet.getRange(dr, 13, n, 2).setNumberFormat('0');        // Expiry Cap, Final Max
      sheet.getRange(dr, 15, n, 6).setNumberFormat('0');        // Store Inv → Allocated Qty
      sheet.getRange(dr, 21, n, 1).setNumberFormat('0.0');      // Days of Stock
      sheet.getRange(dr, 22, n, 1).setNumberFormat('0.0');      // Priority Score
      sheet.getRange(dr, 23, n, 3).setNumberFormat('0.000');    // Vel, Cat, Eff ×
    }

    // Style header row
    const headerRange = sheet.getRange(CONFIG.HEADER_ROW, CONFIG.START_COLUMN, 1, NUM_COLS);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#1a73e8');
    headerRange.setFontColor('#ffffff');

    return createJsonResponse({
      status: 'success',
      rowsWritten: dataRows.length,
      sheetName: sheetName,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    Logger.log('Error in doPost: ' + error.toString());
    return createJsonResponse({ status: 'error', message: error.toString() });
  }
}

function createJsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function testPostEndpoint() {
  const testData = {
    postData: {
      contents: JSON.stringify({
        sheetName: 'Fairview',
        data: [{
          store_name: 'Fairview',
          product_name: 'Red E Dragon Free 500',
          sku: 'SKU001',
          product_id: 'P001',
          category: 'BEVERAGES',
          total_sold_qty: 38,
          dead_days: 0,
          avg_daily_sales: 12.7,
          season_adj_daily_sales: 12.7,
          safety_stock: 38,
          min_level: 152,
          max_level: 381,
          expiry_cap: 381,
          final_max: 381,
          store_inv: -8215,
          on_order: 0,
          inv_position: -8215,
          wh_on_hand: -1250,
          ordered_qty: 152,
          allocated_qty: 0,
          days_of_stock: 0.0,
          priority_score: 100.0,
          velocity_mult: 1.0,
          category_mult: 1.0,
          effective_mult: 1.2
        }]
      })
    }
  };
  const result = doPost(testData);
  Logger.log(result.getContent());
}
