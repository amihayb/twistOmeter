let serialPort;
let writer;
let reader;

let intervalShowAngle = null;
let intervalMove;

let angle = 0;

// Add at the top with other global variables
// let angleData = [];
// let currentData = [];
// let timeData = [];
let startTime;
let shouldRecordData = false;
let prevAngle = null;
let firstValidRead = false;
let angleChangeFailCount = 0;

// Replace angleData, currentData, timeData arrays with rows object
let rows = {
  time: [],
  angle: [],
  current: [],
  torque: []
};

function about(){
  //alert('For support, contact me:\n\nAmihay Blau\nmail: amihay@blaurobotics.co.il\nPhone: +972-54-6668902');
  Swal.fire({
    title: "Twist O Meter",
    html: "For support, contact me:<br><br> Amihay Blau <br> mail: amihay@blaurobotics.co.il <br> Phone: +972-54-6668902",
    icon: "info"
  });
}

/////////// Communication ///////////

async function connectToggle(button) {
  if (button.checked) {
    const isConnected = await requestSerialPort();
    if (!isConnected) {
      //document.getElementById('connection-toggle').checked = false;
      button.checked = false; // Uncheck the toggle button if connection fails
      return
    }
    await readMsg('eo=0;');
    const moState = await readMsg('mo');
    if (moState.includes('1')) {
      document.getElementById('motor-toggle').checked = true;
    }

    showAngle(true);
  } else {
    showAngle(false);
    await sendMsg('eo=1;');
    closeSerialPort();
  }
}

async function requestSerialPort() {
  try {
      serialPort = await navigator.serial.requestPort();
      await serialPort.open({ baudRate: 230400 });   // Platinum
      writer = await serialPort.writable.getWriter();
      reader = await serialPort.readable.getReader();
      console.log('Serial port opened successfully!');
      return true;
  } catch (error) {
      console.error('Error connecting to serial port:', error);
      return false;
  }
}

async function sendMsg(message, envelope = true) {
  if (!serialPort) {
      console.error('Serial port not opened. Click "Open Serial Port" first.');
      return;
  }

  message = message + '\r';
  // const writer = serialPort.writable.getWriter();
  await writer.write(new TextEncoder().encode(message));
}

async function closeSerialPort() {
  if (serialPort) {
      await writer.releaseLock();
      await reader.releaseLock();
      await serialPort.close();
      console.log('Serial port closed.');
  }
}

async function readMsg(message) {
  // Send the message

  // Initialize the reader for the serial port
  // let reader = serialPort.readable.getReader();

  try {
    if (message !== undefined) {
      await sendMsg(message);
    }
    // Read data from the serial port
    const { value, done } = await reader.read();
    // console.log(value);
    if (value) {
      // Convert Uint8Array to string and process the response
      const decodedValue = new TextDecoder().decode(value);
      response = decodedValue;
      // console.log(response);
      return response; // Return the processed response
    } else {
      console.warn("No data received or connection closed.");
      return null;
    }
  } catch (error) {
    console.error("Error reading from serial port:", error);
    return null;
  } finally {
    // Always release the reader lock
  //   await reader.releaseLock();
  }
}


async function flushSerialReader(timeout = 100) {
  
  await reader.cancel();             // Signals the stream to discard data
  reader.releaseLock();              // Releases the lock
  reader = serialPort.readable.getReader(); // Get a fresh reader
}
/////////// End of Communication ///////////


function motorToggle(button) {
  if (!serialPort) {
    button.checked = false;
    Swal.fire({
      title: 'No Connection',
      text: 'Please connect to the device first',
      icon: 'error'
    });
    return;
  }

  if (button.checked) {
    sendMsg('mo=1');
    console.log('Motor ON!');
  } else {
    sendMsg('mo=0');
    console.log('Motor OFF!');
    // Stop any ongoing movement interval
    if (intervalMove) {
      clearInterval(intervalMove);
      intervalMove = null;
    }
    
    // Reset start button state
    const startButton = document.getElementById('startButton');
    if (startButton) {
      startButton.disabled = false;
      startButton.style.opacity = '1';
      startButton.style.cursor = 'pointer';
      startButton.textContent = 'Start';
      startButton.style.backgroundColor = '';
    }
  }
}

async function ensureMotorOn() {
  const motorToggleButton = document.getElementById('motor-toggle');
  if (!motorToggleButton.checked) {
    motorToggleButton.checked = true;
    motorToggle(motorToggleButton);
    await new Promise(resolve => setTimeout(resolve, 50)); // Add 50 msec delay
  }
}


async function showAngle(state) {

  if (intervalShowAngle && !state) {
      clearInterval(intervalShowAngle);
      intervalShowAngle = null;
      prevAngle = null;
      console.log("Stopped show angle interval");
  } else if (state)  {
      console.log("Start show angle interval");
      intervalShowAngle = setInterval(() => {
        updateAngleFromInterval();
      }, 50); // ms
  }
}

async function updateAngleFromInterval() {
  const response = await readMsg('px;iq');
  const [angleStr, currentStr] = response.split(';');
  
  // Parse angle (first number)
  const rawAngle = parseFloat(angleStr.replace(/px\r/, '').trim())/728.178;
  
  // Parse current (second number) 
  const current = parseFloat(currentStr?.trim() ?? NaN);
  
  // Validate angle and current
  let isValid = true;
  
  // Check for NaN values
  if (isNaN(rawAngle) || isNaN(current)) {
    isValid = false;
  }
  
  // Check if angle is within valid range (-180 to 180)
  if (rawAngle < -180 || rawAngle > 180) {
    isValid = false;
  }
  
  // Check angle change rate if we have a previous value
  if (prevAngle !== null) {
    const angleChange = Math.abs(rawAngle - prevAngle);
    if (angleChange > 10) {
      isValid = false;
      angleChangeFailCount++;
      if (angleChangeFailCount >= 10) {
        prevAngle = null;
        angleChangeFailCount = 0;
        console.warn('Angle change check failed 10 times, resetting prevAngle.');
      }
    } else {
      angleChangeFailCount = 0;
    }
  }
  
  // Check if current is within valid range (-10 to 10 A)
  if (current < -10 || current > 10) {
    isValid = false;
  }
  
  // Only update angle and record data if values are valid
  if (isValid) {
    angle = rawAngle;
    prevAngle = angle;
    firstValidRead = true;
    
    updateAngle(angle);
    document.getElementById('CurrentInput').value = current.toFixed(1);

    // Save data if test is running and we've reached minAngle at least once
    if (intervalMove && shouldRecordData) {
      rows.angle.push(angle);
      rows.current.push(current);
      rows.torque.push(current * 27.8);
      rows.time.push(Date.now() - startTime); // Time in milliseconds
    }
  }
}

async function updateAngleFromInput() {
  const targetInput = document.getElementById('targetInput');
  const tangle = parseFloat(targetInput.value) || 0;

  await ensureMotorOn();

  // Call updateAngle from knob.js
  updateAngle( tangle );
  
  sendMsg('pa=' + Math.floor(tangle * 728.178) + ';bg'); // Convert to raw value
}


async function setCurrentAngle() {

  const setAngle = parseFloat(document.getElementById('setAngle').value);
  // Show confirmation dialog
  const result = await Swal.fire({
    title: 'Set Current Angle',
    text: `Are you sure you want to set current angle to ${setAngle}?`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Yes',
    cancelButtonText: 'No'
  });
  if (!result.isConfirmed) {
    console.log('Canceled');
    return;
  }

  showAngle(false);
  await flushSerialReader();

  var tRead = await readMsg('S2[17]');
  const curOffset = parseFloat(tRead.replace(';', ''));
  const currentAngle = Math.floor((setAngle - angle) * 728.178) + curOffset;
  sendMsg('S2[17]=' + currentAngle);
  console.log('S2[17]=' + currentAngle);
  // Send message based on whether angle is negative
  if (currentAngle > 0.0) {
    sendMsg('S2[18]=0;');
    console.log('S2[18]=0;');
  } else {
    sendMsg('S2[18]=-1;');
    console.log('S2[18]=-1;');
  }
  sendMsg('s2[1]=0');    // Restart encoder
  sendMsg('s2[1]=5;');    // Set back encoder type
  await new Promise(resolve => setTimeout(resolve, 200));
  sendMsg('sv;');

  // console.log('sv; bu=0x1234');
  //sendMsg('sv; bu=0x1234');    // Restart driver

  await new Promise(resolve => setTimeout(resolve, 1000));
  await flushSerialReader();
  showAngle(true);
}



async function startTorqueTest() {
  if (!serialPort) {
    Swal.fire({
      title: 'No Connection',
      text: 'Please connect to the device first',
      icon: 'error'
    });
    return;
  }
  // Only update Torque Test button if not already active
  if (!document.getElementById('torque-test-button').classList.contains('active')) {
    document.querySelectorAll('.button').forEach(button => {
      button.classList.remove('active');
    });
    document.getElementById('torque-test-button').classList.add('active');
  }

  await ensureMotorOn();
  
  // Get min/max angle values from inputs
  const minInput = document.getElementById('minAngleInput');
  const maxInput = document.getElementById('maxAngleInput');
  const velocityInput = document.getElementById('velocityInput');
  const minAngle = parseFloat(minInput.value);
  const maxAngle = parseFloat(maxInput.value);
  const velocity = parseFloat(velocityInput.value);

  // Disable start button during test
  const startButton = document.getElementById('startButton');
  startButton.disabled = true;
  startButton.style.opacity = '0.5';
  startButton.style.cursor = 'not-allowed';

  // Reset data arrays
  rows = {
    time: [],
    angle: [],
    current: [],
    torque: []
  };
  shouldRecordData = false;
  startTime = Date.now();

  if (intervalMove) {
    clearInterval(intervalMove);
    intervalMove = null;
  }

  let cycleCount = -0.5;
  let movingToMax = false;
  
  await sendMsg('sp=' + Math.floor(velocity * 728.178) + ';' + 'pa=' + Math.floor(minAngle * 728.178) + ';bg');
  intervalMove = setInterval(async () => {
    if (movingToMax && Math.abs(angle - maxAngle) < 0.5) {
      // Reached max angle, move back to min
      sendMsg('pa=' + Math.floor(minAngle * 728.178) + ';bg');
      movingToMax = false;
      cycleCount += 0.5; // Half cycle completed
    } else if (!movingToMax && Math.abs(angle - minAngle) < 0.5) {
      // Reached min angle, move to max
      sendMsg('pa=' + Math.floor(maxAngle * 728.178) + ';bg');
      movingToMax = true;
      cycleCount += 0.5; // Half cycle completed
      shouldRecordData = true; // Start recording after first time reaching minAngle
    }
    const reps = document.getElementById('repsInput');
    // Check if two complete cycles are done
    if (cycleCount >= reps.value) {
      // Turn off motor at end of test
      const motorToggle = document.getElementById('motor-toggle');
      motorToggle.checked = false;
      motorToggle.dispatchEvent(new Event('change'));

      clearInterval(intervalMove);
      intervalMove = null;
      startButton.disabled = false;
      startButton.style.opacity = '1';
      startButton.style.cursor = 'pointer';
      //shouldRecordData = false;

      // Show test results
      showTorqueTest();
      
      // Save data to CSV
      saveDataToCSV();

    }
  }, 200);
}

function saveDataToCSV() {
  let csvContent = "Time_ms,Angle_deg,Current_A,Torque_mNm\n";
  
  for (let i = 0; i < rows.time.length; i++) {
    csvContent += `${rows.time[i]},${rows.angle[i].toFixed(3)},${rows.current[i].toFixed(3)},${rows.torque[i].toFixed(3)}\n`;
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `torque_test_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}


/////////// Read and process files ///////////
const fileSelector = document.getElementById('file-selector');
fileSelector.addEventListener('change', (event) => {
  const fileList = event
    .target.files;
  console.log(fileList);
  for (const file of fileList) {
    readFile(file);
    // alert('So far it is just a demo.\nChoose tests on the left to see what is what.\n\nAmihay Blau');
  }
});

function handleDrop(event) {
  event.preventDefault();
  document.getElementById('drop-zone').classList.remove('pale');
  var file = event.dataTransfer.files[0];
  readFile(file);
  //document.getElementById('drop_zone').style.display = 'none';
}

function handleDragOver(event) {
  event.preventDefault();
  //event.target.style.backgroundColor = "#59F2F7";
  document.getElementById('drop-zone').classList.add('pale');
}

function handleDragLeave(event) {
  event.preventDefault();
  //event.target.style.backgroundColor = "#59F2F7";
  document.getElementById('drop-zone').classList.remove('pale');
}


function readFile(file) {
  const reader = new FileReader();
  reader.onload = function(event) {
    const text = event.target.result;
    const lines = text.split(/\r?\n/);
    const header = lines[0].split(',');
    
    // Initialize rows object with empty arrays
    rows = {};
    header.forEach(h => rows[h.trim()] = []);

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      if (values.length === header.length) {
        values.forEach((val, j) => {
          rows[header[j].trim()].push(Number(val));
        });
      }
    }

    // Rename keys to match expected format
    if (rows['Time_ms']) {
      rows['time'] = rows['Time_ms'];
      delete rows['Time_ms'];
    }
    if (rows['Angle_deg']) {
      rows['angle'] = rows['Angle_deg']; 
      delete rows['Angle_deg'];
    }
    if (rows['Current_A']) {
      rows['current'] = rows['Current_A'];
      delete rows['Current_A'];
    }
    if (rows['Torque_mNm']) {
      rows['torque'] = rows['Torque_mNm'];
      delete rows['Torque_mNm'];
    }

    showTorqueTest();
  };
  reader.readAsText(file);
}
/////////// End of Read and process files ///////////


/////////// Ploting Functions ///////////




function createPlotlyTable(m, n, containerId, clean = true) {
  const container = document.getElementById(containerId);

  // Remove any existing table in the container
  if (clean) { 
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
  }

  const table = document.createElement('table');
  const plotHandles = [];

  for (let i = 0; i < m; i++) {
    const row = document.createElement('tr');
    const rowHandles = [];

    for (let j = 0; j < n; j++) {
      const cell = document.createElement('td');
      const plotDiv = document.createElement('div');
      plotDiv.id = `plot-${i}-${j}`;
      plotDiv.className = 'plot-container';
      cell.appendChild(plotDiv);
      row.appendChild(cell);

      rowHandles.push(plotDiv);
    }

    table.appendChild(row);
    plotHandles.push(rowHandles);
  }

  // Append the new table to the designated container
  container.appendChild(table);

  return plotHandles;
}

function plotlyTableToDiscrete(plotHandles) {
  plotHandles.forEach((row) => {
    row.forEach((plotDiv) => {
      const update = {
        'yaxis.type': 'category'
      };
      Plotly.relayout(plotDiv.id, update);
    });
  });
}


function plot(plotHandles, rowIndex, colIndex, xData, yData, traceName = null, title, xLabel, yLabel, color = null, showLeg = true, mode = 'lines') {
  if (rowIndex >= plotHandles.length || colIndex >= plotHandles[rowIndex].length) {
    console.error('Invalid cell index');
    return;
  }

  const plotDiv = plotHandles[rowIndex][colIndex];
  const trace = {
    x: xData,
    y: yData,
    mode: mode,
    marker: color ? { color: color } : {},
    showlegend: showLeg
  };
  if (traceName !== null) {
    trace.name = traceName;
  }
  const layout = {
    title: title,
    xaxis: {
      title: xLabel
    },
    yaxis: {
      title: yLabel,
    },
    legend: {
      x: 1,
      y: 1,
      xanchor: 'right'
    },
    margin: {
      l: 50,    // left margin
      r: 20,    // right margin
      t: 30,    // top margin
      b: 40     // bottom margin
    },
    autosize: true
  };

  const config = {
    editable: true,
    responsive: true
  };

  // Check if the plot already exists
  if (plotDiv.data) {
    // Add new trace to the existing plot
    Plotly.addTraces(plotDiv.id, trace);
  } else {
    // Create a new plot if it doesn't exist
    Plotly.newPlot(plotDiv.id, [trace], layout, config);
  }
}


function addLimitLine(plotHandles, rowIndex, colIndex, val, dashed = 'solid') {
  if (rowIndex >= plotHandles.length || colIndex >= plotHandles[rowIndex].length) {
    console.error('Invalid cell index');
    return;
  }

  const plotDiv = plotHandles[rowIndex][colIndex];
  val = val * r2d;

  var lim1 = {
    x: [window.rows["time"][0], window.rows["time"].slice(-1)[0]],
    y: [val, val],
    name: 'Limit',
    mode: 'lines',
    line: {
      color: 'Red',
      width: 2,
      dash: dashed
    },
    showlegend: false,
  }
  Plotly.addTraces(plotDiv.id, lim1);
  //return lim1;
}


function addLimitLinesIfNear(plotHandles, rowIndex, colIndex, signal, limit1, limit2) {

  if (signal.some(value => Math.sign(value) == Math.sign(limit1))) {
    addLimitLine(plotHandles, rowIndex, colIndex, limit1);
  }
  if (signal.some(value => Math.sign(value) == Math.sign(limit2))) {
    addLimitLine(plotHandles, rowIndex, colIndex, limit2);
  }
}

function addDivider(plotHandles, rowIndex, colIndex, val, name='devider', dashed = 'dashed') {
  if (rowIndex >= plotHandles.length || colIndex >= plotHandles[rowIndex].length) {
    console.error('Invalid cell index');
    return;
  }

  const plotDiv = plotHandles[rowIndex][colIndex];

  var divide1 = {
    x: [val, val],
    y: plotDiv.layout.yaxis.range,
    name: name,
    mode: 'lines',
    line: {
      color: 'forestgreen',
      width: 2,
      dash: dashed
    },
    // showlegend: false,
  }
  Plotly.addTraces(plotDiv.id, divide1);
  //return lim1;
}

/////////// End of Ploting Functions ///////////


/////////// Show Results table Functions ///////////

function drawTable(data) {
  const table = document.getElementById('resultsTable');

  if (!table) {
    console.error('Table not found');
    return;
  }

  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  const headers = ['Parameter', 'Traverese', 'Elevation', 'Success Criteria'];
  const headerRow = document.createElement('tr');

  headers.forEach(header => {
    const th = document.createElement('th');
    th.textContent = header;
    th.style.textAlign = 'center';  // Center-align headers
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  data.forEach(item => {
    const row = document.createElement('tr');
    const cells = [item.parameter, item.value1.toFixed(2), item.value2.toFixed(2), item.successCriteria];

    cells.forEach((cellValue, index) => {
      const td = document.createElement('td');
      td.textContent = cellValue;
      td.style.textAlign = 'center';  // Center-align cell values

      if (index > 0 && index < 3) { // Check only for Traverese and Elevation columns
        if (Math.abs(cellValue) > item.successCriteria) {
          td.style.color = 'red';
        } else {
          td.style.color = 'green';
        }
      }

      row.appendChild(td);
    });

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
}

function drawTableOneCol(data) {
  const table = document.getElementById('resultsTable');

  if (!table) {
    console.error('Table not found');
    return;
  }

  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  const headers = ['Parameter', 'Value', 'Success Criteria'];
  const headerRow = document.createElement('tr');

  headers.forEach(header => {
    const th = document.createElement('th');
    th.textContent = header;
    th.style.textAlign = 'center';  // Center-align headers
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  data.forEach(item => {
    const row = document.createElement('tr');
    const cells = [item.parameter, item.value1.toFixed(2), item.successCriteria.toFixed(2)];

    cells.forEach((cellValue, index) => {
      const td = document.createElement('td');
      td.textContent = cellValue;
      td.style.textAlign = 'center';  // Center-align cell values

      if (item.successMethod === 'bigger')
        success = item.value1 > item.successCriteria;

      if (item.successMethod === 'smaller')
        success = item.value1 < item.successCriteria;


      if (index == 1) { // Check only for value column
        if (success) {
          td.style.color = 'green';
        } else {
          td.style.color = 'red';
        }
      }

      row.appendChild(td);
    });

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
}


/////////// End of Results Table Functions ///////////

// Set pressed button color to active
// let previousLink = null;
let previousLink = document.getElementById('torque-test-button');

document.querySelectorAll('.button').forEach(link => {
  link.addEventListener('click', function (event) {
    event.preventDefault(); // Prevent the default link behavior

    // Reset the previous link's color
    if (previousLink) {
      previousLink.classList.remove('active');
    }

    // Set the current link's color
    this.classList.add('active');

    // Update the previous link
    previousLink = this;
  });
});
// End of Set pressed button color to active


function showTorqueTest() {
  cleanUp();

  const pl = createSplitPlotlyTable('plot-area');

  // Main plot: Angle vs Current (Hysteresis plot)
  plot(pl, 0, 0, rows.angle, rows.torque, traceName = 'Angle', title = "Command - Position", "Angle [deg]", 'Torque [mNm]', null, false, 'markers');
  
  // Calculate regression and add regression line
  const regressionResult = calculateRegression();
  if (regressionResult) {
    plot(pl, 0, 0, rows.regressionAngles, rows.regressionCurrents, traceName = 'Regression', title = "Command - Position", "Angle [deg]", 'Torque [mNm]', 'red', true, 'lines');
  }
  
  // Top right: Angle vs Time
  plot(pl, 0, 1, mult(rows.time, 0.001), rows.angle, traceName = 'Angle', title = "Position", "Time [s]", "Angle [deg]", null, false);
  
  // Bottom right: Current vs Time
  plot(pl, 1, 1, mult(rows.time, 0.001), rows.current, traceName = 'Current', title = "Current", "Time [s]", "Current [Amp]", null, false);
}


function addLine(vName, ax_y = 1, ax_x = 1, factor = 1, showName, showLeg = true, allRows) {

  if (showName === undefined) {
    showName = vName.replace(/_/g, " ");
  }

  let x = [];
  let y = [];

  var x_axis = "time";
  x = rows[x_axis];
  y = mult(rows[vName], factor);
  var trace = {
    x: x,
    y: y,
    xaxis: 'x' + ax_x,
    yaxis: 'y' + ax_y,
    name: showName,
    type: 'scatter',
    showlegend: showLeg,
  };
  if (!showLeg) {
    trace.line = {
      color: 'Red',
      width: 2,
    };
  }
  return trace;
}
//plotFromCSV();


function addLimitLineTraces(ax_y = 1, ax_x = 1, val) {

  var lim1 = {
    x: [window.rows["time"][0], window.rows["time"].slice(-1)[0]],
    y: [val, val],
    xaxis: 'x' + ax_x,
    yaxis: 'y' + ax_y,
    name: 'Limit',
    mode: 'line',
    line: {
      color: 'Red',
      width: 2,
    },
    showlegend: false,
  }
  return lim1;
}

function addLineBin(vName, ax, allRows) {
  let x = [];
  let y = [];

  var x_axis = "time";
  x = rows[x_axis];
  y = rows[vName];
  var trace = {
    x: x,
    y: y,
    yaxis: 'y' + ax,
    name: vName,
    type: 'scatter',
  };
  return trace;
}

function plotTraces(traces, sp_r = 2, sp_c = 1) {
  var layout = {
    height: window.innerHeight,
    title: {
      text: this.fileName,
      font: {
        size: 24
      },
    },
    grid: {
      rows: sp_r,
      columns: sp_c,
      pattern: 'coupled',
    },
    yaxis: { title: 'Y Axis 1' },
    yaxis2: { title: 'Y Axis 2' },
    annotation: [
      {
        xref: 'paper',
        yref: 'paper',
        x: 0,
        xanchor: 'right',
        y: 1,
        yanchor: 'bottom',
        text: 'test',
        showarrow: false
      }
    ],
    showlegend: false
  };

  //https://plot.ly/javascript/configuration-options/
  let config = {
    responsive: true,
    // staticPlot: true,
    // editable: true
  };

  Plotly.newPlot("plot-area", traces, layout, { editable: true });
}


function processData() {
  rows["time"] = mult(removeFirst(rows["time"]),0.001);
  rows["padestalAimCmdTr"] = rows["outAimingAlgDebugOutfSpare5"];
  rows["padestalAimCmdEl"] = plus(rows["outAimingAlgDebugOutfSpare6"], 15 * d2r);
  // rows["padestalAimCmdEl"] = rows["outAimingAlgDebugOutfSpare6"];

  rows["padestalAimErrTr"] = minusArrays(rows["outAimingAlgDebugOutfSpare5"], rows["inWS_SensorsstResolversfPsi"]);
  rows["padestalAimErrEl"] = plus(minusArrays(rows["outAimingAlgDebugOutfSpare6"], rows["inWS_SensorsstResolversfTheta"]), 15 * d2r);
  // rows["padestalAimErrEl"] = minusArrays(rows["outAimingAlgDebugOutfSpare6"], rows["inWS_SensorsstResolversfTheta"]);

  rows["totalAimErrTr"] = minusArrays(rows["padestalAimErrTr"], rows["inLEUfMissile_RelAngle_Tr_M"]);
  // rows["totalAimErrEl"] = plus(minusArrays(rows["padestalAimErrEl"], rows["inLEUfMissile_RelAngle_El_M"]), +15 * d2r);
  rows["totalAimErrEl"] = minusArrays(rows["padestalAimErrEl"], rows["inLEUfMissile_RelAngle_El_M"]);

  rows["CpCmd_Tr"] = mult(derivative(rows["inWS_SensorsstResolversfPsi"]), 0.5);
  // rows["CpCmd_El"] = plus(mult(derivative(rows["inWS_SensorsstResolversfTheta"]), 0.5), -15 * d2r);
  rows["CpCmd_El"] = mult(derivative(rows["inWS_SensorsstResolversfTheta"]), 0.5);
}


function cleanUp() {
  try {
    var explenation_text = document.getElementById("explenation_text");
    explenation_text.style.display = "none";

    const table = document.getElementById('resultsTable');
    // Remove any existing table in the container
    while (table.firstChild) {
      table.removeChild(table.firstChild);
    }

  } catch (error) { };

}


////////////////////////////// Math Operations //////////////////////////////
function diff(y, x) {
  let Ts = 0.01;
  let d = [];
  for (i = 1; i < y.length; i++) {
    d[i] = (Number(y[i]) - Number(y[i - 1])) / Ts;
  }
  d[0] = d[1];
  return d;
}

function integrate(y, x) {
  let Ts = 0.01;
  let yInt = [];
  yInt[0] = parseFloat(y[0]);
  for (i = 1; i < y.length; i++) {
    yInt[i] = yInt[i - 1] + Ts * parseFloat(y[i]);
  }
  return yInt;
}

function filter(y, ws) {
  let Ts = 0.01;
  w = parseFloat(ws);
  console.log(w)
  /*let N0 = 0.0198250831839801;
  let N1 = 0.0396501663679602;
  let N2 = 0.0198250831839801;
  let D1 = -1.56731054883897;
  let D2 = 0.646610881574895;*/
  const pi = 3.1416;
  let D0 = pi ** 2 * w ** 2 + 140 * pi * w + 10000;
  let D1 = (2 * pi ** 2 * w ** 2 - 20000) / D0;
  let D2 = (pi ** 2 * w ** 2 - 140 * pi * w + 10000) / D0;
  let N0 = (w ** 2 * pi ** 2) / D0;
  let N1 = (2 * w ** 2 * pi ** 2) / D0;
  let N2 = N0;

  console.log(N0);
  console.log(N1);
  console.log(N2);
  console.log(D1);
  console.log(D2);


  //〖yf〗_k=N_0 y_k+N_1 y_(k-1)+N_2 y_(k-2)- D_1 〖yf〗_(k-1)-D_2 〖yf〗_(k-2)
  let yf = [];
  for (i = 0; i < y.length; i++) {
    yf[i] = ((i >= 2) ? parseFloat(N0 * y[i] + N1 * y[i - 1] + N2 * y[i - 2] - D1 * yf[i - 1] - D2 * yf[i - 2]) : parseFloat(y[i]));
  }
  //yf = y.map((item, i) => (i>=2) ? parseFloat(N0*y[i] + N1*y[i-1] + N2*y[i-2] - D1*yf[i-1] - D2*yf[i-2]) : parseFloat(y[i]) );
  //yf = y.map((item, i) => (i>=2) ? parseFloat(7) : parseFloat(y[i]) );

  return yf;
}

function detrend(y, x) {
  let a = (parseFloat(y[y.length - 1]) - parseFloat(y[0])) / (y.length - 1);
  let yd = y.map((item, i) => parseFloat(y[i]) - a * i);
  return yd;
}

function fixAngle(y, x) {
  let yo = [];
  let bias = 0;
  yo[0] = y[0];
  for (i = 1; i < y.length; i++) {
    bias += (y[i] - y[i - 1] > 300) ? -360 : 0;
    bias += (y[i] - y[i - 1] < -300) ? 360 : 0;
    yo[i] = y[i] + bias;
  }
  return yo;
}

function std(v) {
  mu = mean(v);
  sum = 0;
  for (var i = 0; i < v.length; i++) {
    sum += Math.pow(Math.abs(v[i] - mu), 2);
  }
  return Math.sqrt(sum / (v.length - 1));
}

function export2csv() {

  exportToCsv('download.csv', rows);
}

function fitLinear(x, y) {
  const n = x.length;
  if (n !== y.length) throw new Error("x and y must be same length");

  const meanX = x.reduce((sum, xi) => sum + xi, 0) / n;
  const meanY = y.reduce((sum, yi) => sum + yi, 0) / n;

  const numerator = x.reduce((sum, xi, i) => sum + (xi - meanX) * (y[i] - meanY), 0);
  const denominator = x.reduce((sum, xi) => sum + (xi - meanX) * (xi - meanX), 0);

  const slope = numerator / denominator;
  const bias = meanY - slope*meanX;

  return { slope, bias };
}

function exportToCsv(filename, rows) {

  var processRow = function (row) {
    var finalVal = '';
    for (var j = 0; j < row.length; j++) {
      var result = processVal(row[j])
      if (j > 0)
        finalVal += ',';
      finalVal += result;
    }
    return finalVal + '\n';
  };

  var csvFile = '';
  // for (var i = 0; i < rows.length; i++) {
  //     csvFile += processRow(rows[i]););
  // }
  let fields = Object.keys(rows);

  csvFile += processRow(Object.keys(rows));
  //Object.keys(rows).forEach(field => csvFile += processRow(rows[field]));
  for (var j = 0; j < rows[fields[0]].length; j++) {
    csvFile += column2row(rows, j);
  }


  var blob = new Blob([csvFile], { type: 'text/csv;charset=utf-8;' });
  if (navigator.msSaveBlob) { // IE 10+
    navigator.msSaveBlob(blob, filename);
  } else {
    var link = document.createElement("a");
    if (link.download !== undefined) { // feature detection
      // Browsers that support HTML5 download attribute
      var url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  function column2row(row, j) {
    let finalVal = '';
    Object.keys(rows).forEach(field => finalVal += processVal(row[field][j]) + ',');
    finalVal = finalVal.slice(0, -1);
    return finalVal + '\n';
  }

  function processVal(val) {
    var innerValue = val === null ? '' : val.toString();
    if (val instanceof Date) {
      innerValue = val.toLocaleString();
    };
    var result = innerValue.replace(/"/g, '""');
    if (result.search(/("|,|\n)/g) >= 0)
      result = '"' + result + '"';
    return result;
  }
}

function getIdx(arr, val) {
  var indexes = [], i = -1;
  while ((i = arr.indexOf(val, i + 1)) != -1) {
    indexes.push(i);
  }
  return indexes;
}

function addLabelsLine() {

  if (document.getElementById("labelsNavBar").style.display == "none") {
    document.getElementById('labelsNavBar').style.display = 'flex';

    var SignalLabels = localStorage["SignalLabels"];
    if (SignalLabels != undefined) {
      document.getElementById("labelsInput").value = SignalLabels;
    }
    document.getElementById("labelsInput").addEventListener('input', updateValue);
  } else {
    document.getElementById('labelsNavBar').style.display = 'none';
  }

  function updateValue(e) {
    localStorage.setItem('SignalLabels', document.getElementById("labelsInput").value);
  }

  /*if ( !document.getElementById('labelsInput') ) {
 
  var label = document.createElement("label");
  label.innerHTML = "Labels: "
  label.htmlFor = "labels";
  var input = document.createElement('input');
  input.name = 'labelsInput';
  input.id = 'labelsInput';
  document.getElementById('labelsNavBar').appendChild(label);
  document.getElementById('labelsNavBar').appendChild(input);
  }
  else {
    document.getElementById('labelsInput').style.display = 'none';
 
  }*/
}

let mult = (array, factor) => array.map(x => x * factor);

const multArrays = (arr1, arr2) => arr1.map((num, i) => num * arr2[i]);

let plus = (array, plus) => array.map(x => parseFloat(x) + plus);

const minusArrays = (a, b) => a.map((val, index) => val - b[index]);

let removeFirst = (array) => array.map((item, idx, all) => parseFloat(item) - parseFloat(all[0]));

let removeMean = (array) => array.map((item, idx, all) => parseFloat(item) - mean(all));

let mean = (array) => array.reduce((a, b) => parseFloat(a) + parseFloat(b)) / array.length;

const derivative = arr => arr.slice(1).map((val, index) => 333 * (val - arr[index]));

const minPositive = arr => {
  const positives = arr.filter(num => num > 0);
  return positives.length > 0 ? Math.min(...positives) : Math.max(...arr);
};

let maxAbs = (arr) => Math.max(...arr.map(Math.abs));
const maxNegative = arr => {
  const negatives = arr.filter(num => num < 0);
  return negatives.length > 0 ? Math.max(...negatives) : Math.min(...arr);
};

let min = (arr) => r2d * Math.min(...arr);
let max = (arr) => r2d * Math.max(...arr);

//const minPositive = arr => Math.min(...arr.filter(num => num > 0));   // the minimum of only the positive numbers (closest to zero)
//const maxNegative = arr => Math.max(...arr.filter(num => num < 0));   // the maximum of only the negtive numbers (closest to zero)

let strClean = (str) => str.replace(/[^a-zA-Z0-9 ]/g, "");

let lastVal = (arr) => (parseFloat(arr.slice(-1)[0]) * r2d);

const findFirstChangeIndex = data => data.findIndex((value, index) => index > 0 && value !== data[index - 1]);


let r2d = 180 / 3.1416;
let d2r = 3.1416 / 180;

//var minIdx = (array, val) => array.findIndex(n => n > val);
//var maxIdx = (array, val) => array.findIndex(n => n > val);

////////////////////////// End of Math Operations ///////////////////////////

function validateAngleInput(inputElement) {
  const value = parseFloat(inputElement.value);
  if (isNaN(value) || value < -160 || value > 110) {
    inputElement.value = '0';
    Swal.fire({
      title: 'Invalid Angle',
      text: 'Angle must be between -160 and 110 degrees',
      icon: 'error'
    });
  }
}

function validateVelocityInput(inputElement) {
  const value = parseFloat(inputElement.value);
  if (isNaN(value) || value < 1 || value > 60) {
    inputElement.value = '30';
    Swal.fire({
      title: 'Invalid Velocity',
      text: 'Velocity must be between 1 and 60 deg/s',
      icon: 'error'
    });
  }
}

// Add event listeners for input validation
document.addEventListener('DOMContentLoaded', function() {
  const minAngleInput = document.getElementById('minAngleInput');
  const maxAngleInput = document.getElementById('maxAngleInput');
  const velocityInput = document.getElementById('velocityInput');

  minAngleInput.addEventListener('change', () => validateAngleInput(minAngleInput));
  maxAngleInput.addEventListener('change', () => validateAngleInput(maxAngleInput));
  velocityInput.addEventListener('change', () => validateVelocityInput(velocityInput));
});

function createSplitPlotlyTable(containerId, clean = true) {
  const container = document.getElementById(containerId);

  // Remove any existing table in the container
  if (clean) {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
  }

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.height = '600px'; // Set a fixed height for the entire table
  table.style.borderCollapse = 'collapse'; // Remove spacing between cells
  const plotHandles = [[], []]; // Create 2D array structure

  // Create the single row
  const row = document.createElement('tr');
  row.style.height = '100%';

  // Create left column (large plot)
  const leftCell = document.createElement('td');
  leftCell.style.width = '50%';
  leftCell.style.height = '100%';
  leftCell.style.padding = '0'; // Remove cell padding
  const leftPlotDiv = document.createElement('div');
  leftPlotDiv.id = 'plot-main';
  leftPlotDiv.className = 'plot-container';
  leftPlotDiv.style.height = '100%';
  leftCell.appendChild(leftPlotDiv);
  row.appendChild(leftCell);
  plotHandles[0][0] = leftPlotDiv;

  // Create right column with two rows
  const rightCell = document.createElement('td');
  rightCell.style.width = '50%';
  rightCell.style.height = '100%';
  rightCell.style.padding = '0'; // Remove cell padding
  
  // Create inner table for right column
  const innerTable = document.createElement('table');
  innerTable.style.height = '100%';
  innerTable.style.width = '100%';
  innerTable.style.borderCollapse = 'collapse'; // Remove spacing between rows
  
  // Create top row
  const topRow = document.createElement('tr');
  topRow.style.height = '50%';
  const topPlotCell = document.createElement('td');
  topPlotCell.style.padding = '0'; // Remove cell padding
  const topPlotDiv = document.createElement('div');
  topPlotDiv.id = 'plot-right-top';
  topPlotDiv.className = 'plot-container';
  topPlotDiv.style.height = '100%';
  topPlotCell.appendChild(topPlotDiv);
  topRow.appendChild(topPlotCell);
  innerTable.appendChild(topRow);
  plotHandles[0][1] = topPlotDiv;

  // Create bottom row
  const bottomRow = document.createElement('tr');
  bottomRow.style.height = '50%';
  const bottomPlotCell = document.createElement('td');
  bottomPlotCell.style.padding = '0'; // Remove cell padding
  const bottomPlotDiv = document.createElement('div');
  bottomPlotDiv.id = 'plot-right-bottom';
  bottomPlotDiv.className = 'plot-container';
  bottomPlotDiv.style.height = '100%';
  bottomPlotCell.appendChild(bottomPlotDiv);
  bottomRow.appendChild(bottomPlotCell);
  innerTable.appendChild(bottomRow);
  plotHandles[1][1] = bottomPlotDiv;

  rightCell.appendChild(innerTable);
  row.appendChild(rightCell);

  table.appendChild(row);
  container.appendChild(table);

  return plotHandles;
}

function AnalyzeRecord(){
  // Trigger file selector when Analyze Record is clicked
  const fileSelector = document.getElementById('file-selector');
  fileSelector.click();

  // Add one-time event listener for file selection
  fileSelector.addEventListener('change', function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
      readFile(file);
    }
    // Remove the event listener after it's used
    fileSelector.removeEventListener('change', handleFileSelect);
    // Reset the file input
    fileSelector.value = '';
  }, { once: true });
}

function calculateRegression() {
  // Check if we have data to analyze
  if (!rows.angle || !rows.torque || rows.angle.length === 0 || rows.torque.length === 0) {
    Swal.fire({
      title: 'No Data',
      text: 'Please record or load data before calculating regression',
      icon: 'error'
    });
    return null;
  }

  // Prepare data for regression
  const { slope, bias } = fitLinear(rows.angle, rows.torque);

  // Format the equation
  const equation = `y = ${slope.toFixed(3)}x + ${bias.toFixed(3)}`;
  
  // Create evenly spaced angles array
  const minAngle = Math.floor(Math.min(...rows.angle));
  const maxAngle = Math.ceil(Math.max(...rows.angle));
  const regressionAngles = [];
  const regressionCurrents = [];
  
  // Generate angles with 1-degree resolution
  for (let angle = minAngle; angle <= maxAngle; angle++) {
    regressionAngles.push(angle);
    // Calculate current using regression equation: y = mx + b
    const current = slope * angle + bias;
    regressionCurrents.push(current);
  }
  
  // Store regression data in rows object
  rows.regressionAngles = regressionAngles;
  rows.regressionCurrents = regressionCurrents;
  
  // Display results
  // Swal.fire({
  //   title: 'Regression Analysis',
  //   html: `
  //     <p>Equation: ${equation}</p>
  //     <p>Generated ${regressionAngles.length} points from ${minAngle}° to ${maxAngle}°</p>
  //   `,
  //   icon: 'info'
  // });

  return {
    slope,
    bias,
    string: equation,
    angles: regressionAngles,
    currents: regressionCurrents
  };
}

