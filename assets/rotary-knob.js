class RotaryKnob extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        .knob-container {
          position: relative;
          width: 170px;
          height: 170px;
        }
        .knob {
          width: 110%;
          height: 110%;
          position: absolute;
          top: 8%;
          left: -5%;
          z-index: 1;
        }
        .little-knob {
          position: absolute;
          top: 32px;
          left: 50%;
          transform: translateX(-50%);
          width: 20px;
          height: 20px;
          pointer-events: none;
          z-index: 10;
          transform-origin: center 52px;
        }
        .angle-display {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #00f5d4;
          font-size: 20px;
          font-weight: bold;
          pointer-events: none;
          z-index: 5;
        }
      </style>
      <div class="knob-container">
        <div class="angle-display" id="angleDisplay">0°</div>
        <img src="../assets/knob.svg" class="knob" id="knob" alt="Knob" />
        <img src="../assets/littleKnob.svg" class="little-knob" id="handle" alt="Little Knob" />
      </div>
    `;
  }

  connectedCallback() {
    const knobContainer = this.shadowRoot.querySelector('.knob-container');
    const handle = this.shadowRoot.getElementById('handle');
    const angleDisplay = this.shadowRoot.getElementById('angleDisplay');
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

    const updateAngle = (e) => {
      const rect = knobContainer.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      let angle = Math.atan2(dy, dx) * (180 / Math.PI);
      angle = (angle + 90 + 360) % 360;
      currentAngle = angle;
      handle.style.transform = `translateX(-50%) rotate(${angle}deg)`;
      angleDisplay.textContent = `${angle.toFixed(1)}°`;
    };
  }
}

customElements.define('rotary-knob', RotaryKnob);
