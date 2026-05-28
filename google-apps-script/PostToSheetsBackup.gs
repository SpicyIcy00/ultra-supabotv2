/**
 * Google Apps Script – Replenishment BACKUP Sheet
 * File: PostToSheetsBackup.gs
 *
 * Deploy this as a separate Web App inside your "New weekly store reports (BACKUP)"
 * Google Spreadsheet. Set the deployment URL as GOOGLE_SHEETS_BACKUP_URL in Railway.
 *
 * Writes ALL 25 replenishment fields. Column order mirrors the dashboard:
 *   Store | Product | SKU | Product ID | Category |
 *   Total Sold | Dead Days | Avg Daily | Season Adj Daily |
 *   Safety Stock | Min | Max | Expiry Cap | Final Max |
 *   Store Inv | On Order | Inv Position | WH Inv |
 *   Ordered Qty | Allocated Qty | Days Stock | Priority Score |
 *   Vel × | Cat × | Eff ×
 *
 * Auto-creates the sheet tab if it doesn't exist yet.
 */

const BACKUP_CFG = {
  HEADER_ROW: 1,
  DATA_START_ROW: 2,
  START_COL: 1,
};

// Human-readable headers — must stay in sync with BACKUP_KEY_ORDER below
const BACKUP_HEADERS = [
  'Store',
  'Product Name',
  'SKU',
  'Product ID',
  'Category',
  'Total Sold',
  'Dead Days',
  'Avg Daily Sales',
  'Season Adj Daily',
  'Safety Stock',
  'Min Level',
  'Max Level',
  'Expiry Cap',
  'Final Max',
  'Store Inv',
  'On Order',
  'Inv Position',
  'WH Inv',
  'Ordered Qty',
  'Allocated Qty',
  'Days of Stock',
  'Priority Score',
  'Vel ×',
  'Cat ×',
  'Eff ×',
];

// Must match the key names produced by transformReplenishmentForBackup in sheetsMapping.ts
const BACKUP_KEY_ORDER = [
  'store_name',
  'product_name',
  'sku',
  'product_id',
  'category',
  'total_sold_qty',
  'dead_days',
  'avg_daily_sales',
  'season_adj_daily_sales',
  'safety_stock',
  'min_level',
  'max_level',
  'expiry_cap',
  'final_max',
  'store_inv',
  'on_order',
  'inv_position',
  'wh_on_hand',
  'ordered_qty',
  'allocated_qty',
  'days_of_stock',
  'priority_score',
  'velocity_mult',
  'category_mult',
  'effective_mult',
];

function doGet() {
  return jsonResponse({
    status: 'success',
    message: 'Replenishment Backup Sheet API is running',
    timestamp: new Date().toISOString(),
  });
}

function doPost(e) {
  try {
    const requestData = JSON.parse(e.postData.contents);

    if (!requestData.data || !Array.isArray(requestData.data) || requestData.data.length === 0) {
      return jsonResponse({ status: 'error', message: 'Invalid or empty data payload' });
    }

    const sheetName = requestData.sheetName || 'Backup';
    const reportData = requestData.data;
    const numCols = BACKUP_KEY_ORDER.length;

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = spreadsheet.getSheetByName(sheetName);

    // Auto-create the tab if it doesn't exist
    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetName);
    }

    // Clear existing content from row 1 downwards
    const lastRow = sheet.getLastRow();
    if (lastRow >= BACKUP_CFG.HEADER_ROW) {
      sheet.getRange(BACKUP_CFG.HEADER_ROW, BACKUP_CFG.START_COL, lastRow, numCols).clearContent();
    }

    // Build row arrays from key order
    const dataRows = reportData.map(row =>
      BACKUP_KEY_ORDER.map(key => {
        const val = row[key];
        return val !== undefined && val !== null ? val : '';
      })
    );

    // Write headers + data in one batch
    const allData = [BACKUP_HEADERS, ...dataRows];
    sheet
      .getRange(BACKUP_CFG.HEADER_ROW, BACKUP_CFG.START_COL, allData.length, numCols)
      .setValues(allData);

    // Style header row
    const headerRange = sheet.getRange(BACKUP_CFG.HEADER_ROW, BACKUP_CFG.START_COL, 1, numCols);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#1a73e8');
    headerRange.setFontColor('#ffffff');

    if (dataRows.length > 0) {
      const dr = BACKUP_CFG.DATA_START_ROW;
      const n  = dataRows.length;

      // Cols 6–7  (Total Sold, Dead Days): integers
      sheet.getRange(dr, 6, n, 2).setNumberFormat('0');
      // Cols 8–12 (Avg Daily, Season Adj, Safety Stock, Min, Max): 2 dp
      sheet.getRange(dr, 8, n, 5).setNumberFormat('0.00');
      // Cols 13–14 (Expiry Cap, Final Max): integers
      sheet.getRange(dr, 13, n, 2).setNumberFormat('0');
      // Cols 15–20 (Store Inv, On Order, Inv Position, WH Inv, Ordered Qty, Allocated Qty): integers
      sheet.getRange(dr, 15, n, 6).setNumberFormat('0');
      // Col 21 (Days of Stock): 1 dp
      sheet.getRange(dr, 21, n, 1).setNumberFormat('0.0');
      // Col 22 (Priority Score): 1 dp
      sheet.getRange(dr, 22, n, 1).setNumberFormat('0.0');
      // Cols 23–25 (Vel, Cat, Eff ×): 3 dp
      sheet.getRange(dr, 23, n, 3).setNumberFormat('0.000');
    }

    // Timestamp below the data
    const tsRow = BACKUP_CFG.DATA_START_ROW + dataRows.length + 1;
    sheet.getRange(tsRow, 1).setValue('Last updated: ' + new Date().toLocaleString());

    return jsonResponse({
      status: 'success',
      rowsWritten: dataRows.length,
      sheetName: sheetName,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    Logger.log('Backup doPost error: ' + error.toString());
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Run from the Apps Script editor to verify the script is wired up correctly */
function testBackupEndpoint() {
  const result = doPost({
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
          effective_mult: 1.2,
        }],
      }),
    },
  });
  Logger.log(result.getContent());
}
