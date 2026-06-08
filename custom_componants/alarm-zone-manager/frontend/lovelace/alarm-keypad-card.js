class AlarmKeypadCard extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._config = {};
    this._codeBuffer = "";
    this._rotationIndex = 0;
    this._rotationTimer = null;
    this.attachShadow({ mode: "open" });
  }

  static getStubConfig() {
    return { entity: "sensor.intrusion_alarm_keypad_keypad_1", type: "grid" };
  }

  static getConfigElement() {
    return document.createElement("alarm-keypad-card-editor");
  }

  setConfig(config) {
    this._config = config;
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 4;
  }

  _entity() {
    return this._config.entity;
  }

  _state() {
    return this._hass?.states[this._entity()];
  }

  _attrs() {
    return this._state()?.attributes || {};
  }

  _isFire() {
    return this._attrs().keypad_type === "fire_alarm";
  }

  _line1() {
    return (this._attrs().status_line1 || "").trim();
  }

  _zonesInAlarm() {
    return this._attrs().zones_in_alarm || [];
  }

  _line2() {
    if (this._codeBuffer) {
      return `Code: ${"*".repeat(this._codeBuffer.length)}`.padEnd(40).slice(0, 40);
    }
    const zones = this._zonesInAlarm();
    if (zones.length && !this._attrs().ready_to_arm) {
      const z = zones[this._rotationIndex % zones.length];
      return `Check: ${z.zone_name}`.padEnd(40).slice(0, 40);
    }
    return "".padEnd(40);
  }

  _startRotation() {
    if (this._rotationTimer) return;
    this._rotationTimer = setInterval(() => {
      const zones = this._zonesInAlarm();
      if (zones.length > 1) {
        this._rotationIndex = (this._rotationIndex + 1) % zones.length;
        this._render();
      }
    }, 5000);
  }

  _style() {
    return `
      .shell { padding:16px; border-radius:8px; }
      .fire { background:#ffcdd2; }
      .intrusion { background:#fafafa; }
      .title { font-weight:bold; margin-bottom:12px; }
      .fire .title { color:#fff; }
      .intrusion .title { color:#000; }
      .status { font-family:monospace; width:40ch; min-height:2.8em; padding:8px; white-space:pre; font-size:14px; }
      .status-fire { background:#c8e6c9; color:#1b5e20; }
      .status-intrusion { background:#bbdefb; color:#0d47a1; }
      .indicators { display:flex; flex-wrap:wrap; gap:16px; margin-top:12px; }
      .indicator { display:flex; align-items:center; gap:6px; }
      .dot { width:20px; height:20px; border-radius:50%; background:#9e9e9e; }
      .dot.green { background:#00e676; box-shadow:0 0 8px #00e676; }
      .dot.red { background:#ff1744; box-shadow:0 0 8px #ff1744; }
      .keypad { display:grid; grid-template-columns:repeat(3,64px); gap:10px; margin-top:16px; justify-content:center; }
      .key { width:64px; height:64px; border-radius:50%; border:none; background:#e0e0e0; color:#000; font-size:20px; cursor:pointer; }
      .hidden-input { position:absolute; opacity:0; height:0; width:0; }
    `;
  }

  _render() {
    if (!this._hass) return;
    const fire = this._isFire();
    const attrs = this._attrs();
    const name = this._state()?.attributes?.friendly_name?.split(": ").pop() || "Keypad";
    const title = fire ? `Fire Alarm: ${name}` : `Intrusion Alarm: ${name}`;

    let body = "";
    if (fire) {
      const alarm = attrs.fire_alarm;
      body = `
        <div class="status status-fire">${this._line1().padEnd(40)}\n${"".padEnd(40)}</div>
        <div class="indicators">
          <div class="indicator"><span class="dot ${attrs.system_active?"green":""}"></span>System Active</div>
          <div class="indicator"><span class="dot ${alarm?"red":""}"></span>Fire Alarm</div>
          <div class="indicator"><span class="dot"></span>Fire Supervisory</div>
          <div class="indicator"><span class="dot"></span>Fire Trouble</div>
        </div>`;
    } else {
      this._startRotation();
      const alpha = attrs.code_type === "alphanumeric";
      body = `
        <div class="status status-intrusion" id="status-box">${this._line1().padEnd(40)}\n${this._line2()}</div>
        <input class="hidden-input" id="code-input" maxlength="16" />
        <div class="keypad">
          ${["1","2","3","4","5","6","7","8","9","X","0","ENT"].map(k =>
            `<button class="key" data-key="${k}">${k}</button>`
          ).join("")}
        </div>`;
      setTimeout(() => this._bindKeys(alpha), 0);
    }

    this.shadowRoot.innerHTML = `<style>${this._style()}</style>
      <div class="shell ${fire?"fire":"intrusion"}">
        <div class="title">${title}</div>
        ${body}
      </div>`;
  }

  _bindKeys(alpha) {
    const root = this.shadowRoot;
    const input = root.querySelector("#code-input");
    const box = root.querySelector("#status-box");
    if (box && alpha) {
      box.onclick = () => { input.focus(); this._codeBuffer = this._codeBuffer || ""; this._render(); };
    }
    if (input && alpha) {
      input.oninput = () => {
        this._codeBuffer = input.value.slice(0, 16);
        this._render();
        setTimeout(() => this._bindKeys(alpha), 0);
      };
      input.onkeydown = (e) => {
        if (e.key === "Enter") this._submitCode();
      };
    }
    root.querySelectorAll(".key").forEach(btn => {
      btn.onclick = () => this._keyPress(btn.dataset.key, alpha, input);
    });
  }

  _keyPress(key, alpha, input) {
    if (key === "X") {
      this._codeBuffer = this._codeBuffer.slice(0, -1);
      if (input) input.value = this._codeBuffer;
      this._render();
      setTimeout(() => this._bindKeys(alpha), 0);
      return;
    }
    if (key === "ENT") {
      this._submitCode();
      return;
    }
    if (alpha) {
      if (input) { input.focus(); this._codeBuffer = this._codeBuffer || ""; }
      this._render();
      setTimeout(() => this._bindKeys(alpha), 0);
      return;
    }
    if (this._codeBuffer.length < 16) {
      this._codeBuffer += key;
      this._render();
      setTimeout(() => this._bindKeys(alpha), 0);
    }
  }

  async _submitCode() {
    if (!this._codeBuffer || !this._hass) return;
    const keypad = this._config.entity;
    const partIds = this._attrs().partition_ids || [];
    await this._hass.callWS({
      type: "alarm_zone_manager/verify_user_code",
      code: this._codeBuffer,
      partition_ids: partIds.length ? partIds : [1],
      intent: "disarm",
    });
    this._codeBuffer = "";
    this._render();
  }
}

customElements.define("alarm-keypad-card", AlarmKeypadCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "alarm-keypad-card",
  name: "Alarm Zone Keypad",
  description: "Intrusion or Fire alarm keypad",
});
