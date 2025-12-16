/**
 * Google Apps Script Web App for Receiving Product Sales Report Data
 * FIXED VERSION - Headers write correctly
 *
 * This script receives POST requests from your BI Dashboard and writes
 * the data to a Google Sheet, clearing previous data each time.
 */

// Configuration
const CONFIG = {
  SHEET_NAME: 'Sheet1',
  HEADER_ROW: 2,        // Headers in row 2
  DATA_START_ROW: 3,    // Data starts at row 3
  START_COLUMN: 1       // Column A
};

/**
 * Handles GET requests
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    message: 'Product Sales Report API is running',
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handles POST requests - receives report data and writes to sheet
 */
function doPost(e) {
  try {
    // Parse incoming JSON data
    const requestData = JSON.parse(e.postData.contents);

    // Validate data structure
    if (!requestData.data || !Array.isArray(requestData.data)) {
      return createJsonResponse({
        status: 'error',
        message: 'Invalid data format. Expected { data: [...] }'
      });
    }

    const reportData = requestData.data;
    if (reportData.length === 0) {
      return createJsonResponse({
        status: 'error',
        message: 'No data to write'
      });
    }

    // Get sheet name from request
    const sheetName = requestData.sheetName || CONFIG.SHEET_NAME;

    // Get the sheet
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(sheetName);

    if (!sheet) {
      return createJsonResponse({
        status: 'error',
        message: `Sheet tab "${sheetName}" not found. Please create a tab with this exact name.`
      });
    }

    // IMPORTANT: Disable event triggers before making any changes
    // We do this by checking lastRow first, then doing ALL writes in one batch
    const lastRow = sheet.getLastRow();

    // Clear existing data in columns A-F from row 2 onwards (preserve row 1)
    if (lastRow >= CONFIG.HEADER_ROW) {
      const numRows = lastRow - CONFIG.HEADER_ROW + 1;
      sheet.getRange(CONFIG.HEADER_ROW, CONFIG.START_COLUMN, numRows, 6).clearContent();
    }

    // Prepare headers
    const headers = [
      ['Product Name', 'SKU', 'Product ID', 'Ordered Qty', 'Store Inv', 'Warehouse Inv']
    ];

    // Prepare data rows
    const dataRows = reportData.map(row => [
      row.product_name || '',
      row.sku || '',
      row.product_id || '',
      row.quantity_sold || 0,
      row.inventory_store_a || 0,
      row.inventory_store_b || 0
    ]);

    // Combine headers and data into one array
    const allData = [...headers, ...dataRows];

    // Write everything in ONE operation (this minimizes trigger firing)
    if (allData.length > 0) {
      const writeRange = sheet.getRange(
        CONFIG.HEADER_ROW,
        CONFIG.START_COLUMN,
        allData.length,
        6
      );
      writeRange.setValues(allData);

      // Format header row (row 2)
      const headerRange = sheet.getRange(CONFIG.HEADER_ROW, CONFIG.START_COLUMN, 1, 6);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#4285f4');
      headerRange.setFontColor('#ffffff');

      // Format number columns (D, E, F) for data rows only (from row 3 onwards)
      if (dataRows.length > 0) {
        sheet.getRange(CONFIG.DATA_START_ROW, 4, dataRows.length, 3).setNumberFormat('0');
      }
    }

    // Return success response
    return createJsonResponse({
      status: 'success',
      rowsWritten: dataRows.length,
      sheetName: sheetName,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    Logger.log('Error in doPost: ' + error.toString());
    return createJsonResponse({
      status: 'error',
      message: error.toString()
    });
  }
}

/**
 * Creates a JSON response
 */
function createJsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

/**
 * onEdit trigger - handles checkbox logic in G1
 * NOTE: This only runs when a USER manually edits a cell, not when the script writes
 */
function onEdit(e) {
  // Only process user edits
  if (!e || !e.range) return;

  const sheet = e.source.getActiveSheet();
  const range = e.range;

  // Check if the edited cell is G1
  if (range.getA1Notation() === 'G1') {
    const isChecked = range.getValue() === true;

    if (isChecked) {
      // Clear columns E and F from row 2 onwards (including headers)
      const lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        const numRows = lastRow - 2 + 1; // From row 2 to last row
        sheet.getRange(2, 5, numRows, 1).clearContent(); // Column E (Store Inv)
        sheet.getRange(2, 6, numRows, 1).clearContent(); // Column F (Warehouse Inv)
      }
    }
    // When unchecked, do nothing
  }
}

/**
 * Test function - run this to verify the script works
 */
function testPostEndpoint() {
  const testData = {
    postData: {
      contents: JSON.stringify({
        sheetName: 'Fairview',
        data: [
          {
            product_name: 'Test Product 1',
            sku: 'SKU001',
            product_id: 'P001',
            quantity_sold: 100,
            inventory_store_a: 50,
            inventory_store_b: 75
          },
          {
            product_name: 'Test Product 2',
            sku: 'SKU002',
            product_id: 'P002',
            quantity_sold: 200,
            inventory_store_a: 25,
            inventory_store_b: 30
          }
        ]
      })
    }
  };

  const result = doPost(testData);
  Logger.log(result.getContent());
}
