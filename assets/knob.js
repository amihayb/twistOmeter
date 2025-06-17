const knobContainer = document.querySelector('.knob-container');
const handle = document.getElementById('handle');
const angleDisplay = document.getElementById('angleDisplay');
let isDragging = false;
let currentAngle = 0;

knobContainer.addEventListener('mousedown', (e) => {
  isDragging = true;
  updateAngle(e);
});

document.addEventListener('mousemove', (e) => {
  if (isDragging) updateAngle(e);
});

document.addEventListener('mouseup', () => {
  isDragging = false;
});

function updateAngle(input) {
  let angle;

  if (typeof input === 'number') {
    // Directly use the provided number
    angle = input;
  } else if (input && input.clientX !== undefined && input.clientY !== undefined) {
    // Handle mouse event
    const rect = knobContainer.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = input.clientX - centerX;
    const dy = input.clientY - centerY;
    angle = Math.atan2(dy, dx) * (180 / Math.PI);
    angle = (angle + 90 + 360) % 360;
  } else {
    return; // invalid input
  }

  currentAngle = angle;
  handle.style.transform = `translateX(-50%) rotate(${angle}deg)`;
  angleDisplay.textContent = `${angle.toFixed(1)}°`;
}

