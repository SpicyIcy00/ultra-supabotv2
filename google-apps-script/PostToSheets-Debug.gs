/**
 * DEBUG VERSION - Google Apps Script with Extra Logging
 *
 * This is a simplified debug version that logs everything
 * Use this temporarily to debug the header issue
 */

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    Logger.log('=== POST Request Received ===');
    Logger.log('Request contents: ' + e.postData.contents);

    const requestData = JSON.parse(e.postData.contents);
    Logger.log('Parsed request data');
    Logger.log('Sheet name: ' + requestData.sheetName);
    Logger.log('Data length: ' + requestData.data.length);

    if (!requestData.data || !Array.isArray(requestData.data)) {
      Logger.log('ERROR: Invalid data structure');
      return createJsonResponse({ status: 'error', message: 'Invalid data format' });
    }

    const sheetName = requestData.sheetName || 'Sheet1';
    const reportData = requestData.data;

    Logger.log('Getting spreadsheet...');
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(sheetName);

    if (!sheet) {
      Logger.log('ERROR: Sheet not found: ' + sheetName);
      return createJsonResponse({
        status: 'error',
        message: `Sheet tab "${sheetName}" not found`
      });
    }

    Logger.log('Sheet found: ' + sheetName);

    // Clear data from row 2 onwards in columns A-F
    Logger.log('Clearing existing data...');
    const lastRow = sheet.getLastRow();
    Logger.log('Last row: ' + lastRow);

    if (lastRow >= 2) {
      const numRows = lastRow - 1; // From row 2 to last row
      sheet.getRange(2, 1, numRows, 6).clear();
      Logger.log('Cleared rows 2-' + lastRow + ', columns A-F');
    }

    // Ensure checkbox exists in G1
    Logger.log('Checking checkbox in G1...');
    const checkboxCell = sheet.getRange('G1');
    const checkboxValue = checkboxCell.getValue();
    Logger.log('G1 value: ' + checkboxValue);

    if (checkboxValue !== true && checkboxValue !== false) {
      checkboxCell.insertCheckboxes();
      checkboxCell.setValue(false);
      Logger.log('Inserted checkbox in G1');
    }

    // Write headers to row 2
    Logger.log('Writing headers to row 2...');
    const headers = ['Product Name', 'SKU', 'Product ID', 'Ordered Qty', 'Store Inv', 'Warehouse Inv'];
    const headerRange = sheet.getRange(2, 1, 1, 6);
    headerRange.setValues([headers]);
    Logger.log('Headers written: ' + headers.join(', '));

    // Format headers
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
    Logger.log('Headers formatted');

    // Write data starting at row 3
    Logger.log('Preparing data for writing...');
    const dataToWrite = reportData.map((row, index) => {
      if (index === 0) {
        Logger.log('Sample row data: ' + JSON.stringify(row));
      }
      return [
        row.product_name || '',
        row.sku || '',
        row.product_id || '',
        row.quantity_sold || 0,
        row.inventory_store_a || 0,
        row.inventory_store_b || 0
      ];
    });

    if (dataToWrite.length > 0) {
      Logger.log('Writing ' + dataToWrite.length + ' rows starting at row 3...');
      const dataRange = sheet.getRange(3, 1, dataToWrite.length, 6);
      dataRange.setValues(dataToWrite);
      Logger.log('Data written successfully');

      // Format numbers
      sheet.getRange(3, 4, dataToWrite.length, 3).setNumberFormat('0');
      Logger.log('Number formatting applied');
    }

    // Verify what we wrote
    Logger.log('Verifying headers...');
    const verifyHeaders = sheet.getRange(2, 1, 1, 6).getValues()[0];
    Logger.log('Headers in sheet: ' + verifyHeaders.join(', '));

    Logger.log('=== SUCCESS ===');
    const response = {
      status: 'success',
      rowsWritten: dataToWrite.length,
      sheetName: sheetName,
      headersVerified: verifyHeaders.join(', '),
      timestamp: new Date().toISOString()
    };
    Logger.log('Response: ' + JSON.stringify(response));

    return createJsonResponse(response);

  } catch (error) {
    Logger.log('=== ERROR ===');
    Logger.log('Error: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    return createJsonResponse({
      status: 'error',
      message: error.toString(),
      stack: error.stack
    });
  } finally {
    lock.releaseLock();
  }
}

function createJsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function doGet(e) {
  return ContentService.createTextOutput('Debug endpoint is running');
}

/**
 * View logs in Apps Script:
 * 1. Run testPostEndpoint()
 * 2. Click "Execution log" button at bottom
 * 3. See detailed logs
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
          }
        ]
      })
    }
  };

  const result = doPost(testData);
  Logger.log('=== Test Result ===');
  Logger.log(result.getContent());
}
