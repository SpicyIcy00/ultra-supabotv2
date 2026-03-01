/**
 * Google Apps Script Web App for Receiving Product Sales Report Data
 *
 * This script receives POST requests from your BI Dashboard and writes
 * the data to a Google Sheet, clearing previous data each time.
 *
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Delete any existing code and paste this entire file
 * 4. Click "Deploy" > "New deployment"
 * 5. Select type: "Web app"
 * 6. Configure:
 *    - Description: "Product Sales Report API"
 *    - Execute as: "Me"
 *    - Who has access: "Anyone"
 * 7. Click "Deploy"
 * 8. Copy the Web App URL and add it to your frontend .env file
 * 9. Authorize the script when prompted
 */

// Configuration - modify these as needed
const CONFIG = {
  SHEET_NAME: 'Sheet1', // Change this to your sheet tab name
  HEADER_ROW: 2, // Headers in row 2
  DATA_START_ROW: 3, // Data starts at row 3
  START_COLUMN: 1, // Column A
  // Column mapping - which columns to write to
  COLUMNS: {
    A: 'product_name',      // Column A: Product Name
    B: 'sku',               // Column B: SKU
    C: 'product_id',        // Column C: Product ID (abbreviated as Pr)
    D: 'quantity_sold',     // Column D: Ordered Qty
    E: 'inventory_store_a', // Column E: inventory_store_a
    F: 'inventory_store_b'  // Column F: inventory_store_b
  }
};

/**
 * Handles GET requests - returns info about the endpoint
 */
function doGet(e) {
  const output = ContentService.createTextOutput(JSON.stringify({
    status: 'success',
    message: 'Product Sales Report API is running',
    endpoint: 'POST data to this URL',
    timestamp: new Date().toISOString()
  }));

  output.setMimeType(ContentService.MimeType.JSON);

  return output;
}

/**
 * Handles POST requests - receives report data and writes to sheet
 */
function doPost(e) {
  // Disable triggers during execution to prevent onEdit from interfering
  const lock = LockService.getScriptLock();
  lock.waitLock(30000); // Wait up to 30 seconds for lock

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

    // Get sheet name from request data, fallback to CONFIG
    const sheetName = requestData.sheetName || CONFIG.SHEET_NAME;

    // Get the active spreadsheet and sheet
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = spreadsheet.getSheetByName(sheetName);

    // If sheet doesn't exist, return error (don't create it automatically)
    if (!sheet) {
      return createJsonResponse({
        status: 'error',
        message: `Sheet tab "${sheetName}" not found. Please create a tab with this exact name in your Google Sheet.`
      });
    }

    // Clear existing data in columns A-F only (from row 2 onwards - includes headers and data)
    // We clear columns A-F but leave column G (checkbox) untouched, and preserve row 1
    const lastRow = sheet.getLastRow();
    if (lastRow >= CONFIG.HEADER_ROW) {
      // Clear columns A through F (6 columns) from row 2 to last row
      const numRows = lastRow - CONFIG.HEADER_ROW + 1;
      sheet.getRange(CONFIG.HEADER_ROW, CONFIG.START_COLUMN, numRows, 6).clear();
    }

    // Store a flag in script properties to prevent onEdit from running
    PropertiesService.getScriptProperties().setProperty('POSTING_IN_PROGRESS', 'true');

    // DON'T touch the checkbox during POST - it triggers onEdit which clears headers
    // The checkbox should be set up manually in the sheet beforehand

    // Write column headers to row 2
    const headers = [
      'Product Name',
      'SKU',
      'Product ID',
      'Ordered Qty',
      'Store Inv',
      'Warehouse Inv'
    ];
    const headerRange = sheet.getRange(CONFIG.HEADER_ROW, CONFIG.START_COLUMN, 1, 6);
    headerRange.setValues([headers]);

    // Format header row (bold, background color)
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4285f4'); // Google Blue
    headerRange.setFontColor('#ffffff'); // White text

    // Prepare data array for batch writing
    const dataToWrite = reportData.map(row => {
      return [
        row.product_name || '',
        row.sku || '',
        row.product_id || '',
        row.quantity_sold || 0,
        row.inventory_store_a || 0,
        row.inventory_store_b || 0
      ];
    });

    // Write data to sheet starting at row 3
    if (dataToWrite.length > 0) {
      const range = sheet.getRange(
        CONFIG.DATA_START_ROW,
        CONFIG.START_COLUMN,
        dataToWrite.length,
        6 // 6 columns
      );
      range.setValues(dataToWrite);

      // Format numbers in quantity columns (D, E, F)
      sheet.getRange(CONFIG.DATA_START_ROW, 4, dataToWrite.length, 3).setNumberFormat('0');
    }

    // Clear the posting flag
    PropertiesService.getScriptProperties().deleteProperty('POSTING_IN_PROGRESS');

    // Return success response
    return createJsonResponse({
      status: 'success',
      rowsWritten: dataToWrite.length,
      sheetName: sheetName,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    Logger.log('Error in doPost: ' + error.toString());
    // Clear the posting flag even on error
    PropertiesService.getScriptProperties().deleteProperty('POSTING_IN_PROGRESS');
    return createJsonResponse({
      status: 'error',
      message: error.toString()
    });
  } finally {
    // Release the lock
    lock.releaseLock();
  }
}

/**
 * Creates a JSON response with proper CORS headers
 * This is CRITICAL for allowing browser requests from your BI Dashboard
 */
function createJsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);

  // These CORS headers are essential for the browser to accept the response
  // Without these, the browser will block the response due to CORS policy
  return output;
}

/**
 * onEdit trigger - runs automatically when any cell is edited
 * Handles the checkbox logic in G1
 */
function onEdit(e) {
  // Check if posting is in progress - if so, don't run this function
  const postingInProgress = PropertiesService.getScriptProperties().getProperty('POSTING_IN_PROGRESS');
  if (postingInProgress === 'true') {
    Logger.log('onEdit skipped - posting in progress');
    return;
  }

  // Only process if the edit is from a user (not from script)
  if (!e || !e.range) return;

  const sheet = e.source.getActiveSheet();
  const range = e.range;

  // Check if the edited cell is G1
  if (range.getA1Notation() === 'G1') {
    const isChecked = range.getValue() === true;

    if (isChecked) {
      // Clear all of columns E and F (inventory columns) from row 3 onwards
      const lastRow = sheet.getLastRow();
      if (lastRow >= 3) {
        // Clear column E (Store Inv)
        sheet.getRange(3, 5, lastRow - 2, 1).clearContent();
        // Clear column F (Warehouse Inv)
        sheet.getRange(3, 6, lastRow - 2, 1).clearContent();

        // Clear entire row 2 (the header row)
        sheet.getRange(2, 1, 1, 6).clearContent();
      }
    } else {
      // If unchecked, restore headers
      const headers = ['Product Name', 'SKU', 'Product ID', 'Ordered Qty', 'Store Inv', 'Warehouse Inv'];
      const headerRange = sheet.getRange(2, 1, 1, 6);
      headerRange.setValues([headers]);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#4285f4');
      headerRange.setFontColor('#ffffff');
    }
  }
}

/**
 * Test function - run this to verify the script works
 * This simulates a POST request with sample data
 */
function testPostEndpoint() {
  const testData = {
    postData: {
      contents: JSON.stringify({
        sheetName: 'Fairview', // Change this to match one of your sheet tab names
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
          },
          {
            product_name: 'Test Product 3',
            sku: 'SKU003',
            product_id: 'P003',
            quantity_sold: 150,
            inventory_store_a: 75,
            inventory_store_b: 100
          }
        ]
      })
    }
  };

  const result = doPost(testData);
  Logger.log(result.getContent());
}
