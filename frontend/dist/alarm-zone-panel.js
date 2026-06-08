class AlarmZonePanel extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._tab = "zones";
    this._zones = [];
    this._partitions = [];
    this._keypads = [];
    this._users = [];
    this._options = {};
    this._log = [];
    this._zoneTestEnabled = false;
    this._editingZone = null;
    this.attachShadow({ mode: "open" });
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._loaded) {
      this._loaded = true;
      this._loadAll();
    }
  }

  async _call(type, extra = {}) {
    return this._hass.callWS({ type, ...extra });
  }

  async _loadAll() {
    const [z, p, k, u, o, l] = await Promise.all([
      this._call("alarm_zone_manager/list_zones"),
      this._call("alarm_zone_manager/list_partitions"),
      this._call("alarm_zone_manager/list_keypads"),
      this._call("alarm_zone_manager/list_alarm_users"),
      this._call("alarm_zone_manager/get_options"),
      this._call("alarm_zone_manager/list_event_log"),
    ]);
    this._zones = z.zones || [];
    this._zoneTestEnabled = z.zone_test_tool_enabled;
    this._partitions = p.partitions || [];
    this._keypads = k.keypads || [];
    this._users = u.users || [];
    this._options = o;
    this._log = l.entries || [];
    this._render();
  }

  _style() {
    return `
      :host { display:block; padding:16px; font-family:Roboto,sans-serif; }
      .tabs { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
      .tab { padding:8px 14px; border:1px solid #ccc; background:#f5f5f5; cursor:pointer; border-radius:4px; }
      .tab.active { background:#1976d2; color:#fff; border-color:#1976d2; }
      table { width:100%; border-collapse:collapse; font-size:13px; }
      th, td { border:1px solid #ddd; padding:6px 8px; text-align:left; }
      th { background:#e0e0e0; position:sticky; top:0; }
      tr:nth-child(even) { background:#f5f5f5; }
      tr:nth-child(odd) { background:#ebebeb; }
      tr.editing { background:#e3f2fd !important; }
      .invalid { color:#c62828; }
      .grayed { color:#888; background:#f0f0f0; }
      input, select { width:100%; box-sizing:border-box; }
      .toolbar { margin-bottom:10px; display:flex; gap:8px; }
      button { padding:6px 12px; cursor:pointer; }
      .grid-wrap { max-height:70vh; overflow:auto; }
      .form-row { margin:8px 0; display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
      label { min-width:180px; }
    `;
  }

  _render() {
    if (!this.shadowRoot) return;
    const content =
      this._tab === "zones" ? this._renderZones() :
      this._tab === "partitions" ? this._renderPartitions() :
      this._tab === "keypads" ? this._renderKeypads() :
      this._tab === "users" ? this._renderUsers() :
      this._tab === "options" ? this._renderOptions() :
      this._renderLog();

    this.shadowRoot.innerHTML = `
      <style>${this._style()}</style>
      <div class="tabs">
        ${["zones","partitions","keypads","users","options","log"].map(t => `
          <div class="tab ${this._tab===t?"active":""}" data-tab="${t}">${t==="users"?"Alarm Users":t==="log"?"Event Log":t.charAt(0).toUpperCase()+t.slice(1)}</div>
        `).join("")}
      </div>
      ${content}
    `;
    this._bind();
  }

  _bind() {
    this.shadowRoot.querySelectorAll(".tab").forEach(el => {
      el.onclick = () => { this._tab = el.dataset.tab; this._render(); };
    });
    const saveOpt = this.shadowRoot.querySelector("#save-options");
    if (saveOpt) saveOpt.onclick = () => this._saveOptions();
    const resetLog = this.shadowRoot.querySelector("#reset-log");
    if (resetLog) resetLog.onclick = () => this._resetLog();
    const exportLog = this.shadowRoot.querySelector("#export-log");
    if (exportLog) exportLog.onclick = () => this._exportLog();
    this.shadowRoot.querySelectorAll("[data-edit-zone]").forEach(el => {
      el.onclick = () => { this._editingZone = parseInt(el.dataset.editZone); this._render(); };
    });
    const saveZone = this.shadowRoot.querySelector("#save-zone");
    if (saveZone) saveZone.onclick = () => this._saveZone();
    this.shadowRoot.querySelectorAll("[data-test-zone]").forEach(el => {
      el.onclick = () => this._testZone(parseInt(el.dataset.testZone));
    });
  }

  _renderZones() {
    const testCol = this._zoneTestEnabled ? `<th>Test</th>` : "";
    const rows = this._zones.slice(0, 200).map(z => {
      const editing = this._editingZone === z.zone_id;
      const testCell = this._zoneTestEnabled ? `<td><button data-test-zone="${z.zone_id}">Activate</button><input type="number" id="dur-${z.zone_id}" value="5" min="0.1" max="300" step="0.1" style="width:60px"/></td>` : "";
      if (editing) {
        return `<tr class="editing"><td colspan="12">
          <div>Name: <input id="zn" value="${z.zone_name}"/></div>
          <div>Type: <select id="zt">
            <option value="automation" ${z.zone_type==="automation"?"selected":""}>Automation</option>
            <option value="intrusion_alarm" ${z.zone_type==="intrusion_alarm"?"selected":""}>Intrusion Alarm</option>
            <option value="fire_alarm" ${z.zone_type==="fire_alarm"?"selected":""}>Fire Alarm</option>
          </select></div>
          <div>Input entity: <input id="zi" value="${z.input_entity_id||""}"/></div>
          <div>Output entity: <input id="zo" value="${z.output_entity_id||""}"/></div>
          <div>Action: <select id="za">
            <option value="disabled">Disabled</option>
            <option value="mirror">Mirror</option>
            <option value="pulse">Pulse</option>
            <option value="activate">Activate</option>
          </select></div>
          <div>Partition: <input id="zp" value="${z.partition||"disabled"}"/></div>
          <button id="save-zone">Save</button>
          <input type="hidden" id="zid" value="${z.zone_id}"/>
        </td></tr>`;
      }
      return `<tr>
        ${testCell}
        <td>${z.zone_id}</td>
        <td>${z.zone_name}</td>
        <td>${z.input_entity_id||""}</td>
        <td>${z.zone_type}</td>
        <td class="${z.intrusion_type_editable?"":"grayed"}">${z.intrusion_type||""}</td>
        <td class="${z.fire_type_editable?"":"grayed"}">${z.fire_type||""}</td>
        <td>${z.delay_milliseconds}ms</td>
        <td>${z.output_entity_id||""}</td>
        <td class="${z.output_action_editable?"":"grayed"}">${z.output_action_display||z.action}</td>
        <td class="${z.partition_editable?"":"grayed"}">${z.partition}</td>
        <td><button data-edit-zone="${z.zone_id}">Edit</button></td>
      </tr>`;
    }).join("");
    return `<div class="grid-wrap"><p>Showing first 200 of 1024 zones</p><table><thead><tr>
      ${testCol}<th>Zone</th><th>Name</th><th>Input</th><th>Type</th><th>Intrusion Type</th><th>Fire Type</th><th>Debounce</th><th>Output</th><th>Action</th><th>Partition</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  async _saveZone() {
    const root = this.shadowRoot;
    const zone = this._zones.find(z => z.zone_id === parseInt(root.querySelector("#zid").value));
    if (!zone) return;
    zone.zone_name = root.querySelector("#zn").value;
    zone.zone_type = root.querySelector("#zt").value;
    zone.input_entity_id = root.querySelector("#zi").value || null;
    zone.output_entity_id = root.querySelector("#zo").value || null;
    zone.action = root.querySelector("#za").value;
    zone.partition = root.querySelector("#zp").value;
    await this._call("alarm_zone_manager/update_zone", { zone });
    this._editingZone = null;
    await this._loadAll();
  }

  async _testZone(zoneId) {
    const inp = this.shadowRoot.querySelector(`#dur-${zoneId}`);
    const sec = parseFloat(inp?.value || 5);
    await this._call("alarm_zone_manager/test_zone_activate", {
      zone_id: zoneId,
      duration_ms: Math.round(sec * 1000),
    });
    await this._loadAll();
  }

  _renderPartitions() {
    const rows = this._partitions.map(p => `<tr>
      <td>${p.partition_id}</td>
      <td>${p.partition_name||""}</td>
      <td class="${p.alarm_account_editable?"":"grayed"}">${p.alarm_account}</td>
      <td>${p.activation_action}</td>
    </tr>`).join("");
    return `<div class="grid-wrap"><table><thead><tr><th>Partition</th><th>Name</th><th>Alarm Account</th><th>Activation Action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  _renderKeypads() {
    const rows = this._keypads.map(k => `<tr>
      <td>${k.keypad_id}</td>
      <td>${k.enabled}</td>
      <td>${(k.partition_ids||[]).join(",")}</td>
      <td>${k.keypad_type}</td>
      <td>${k.keypad_name}</td>
    </tr>`).join("");
    return `<div class="grid-wrap"><table><thead><tr><th>ID</th><th>Enable</th><th>Partitions</th><th>Type</th><th>Name</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  _renderUsers() {
    const rows = this._users.slice(0, 50).map(u => `<tr>
      <td>${u.user_number}</td>
      <td>${u.user_level}</td>
      <td>${(u.partition_ids||[]).length} partitions</td>
      <td>${u.user_name||""}</td>
      <td>${u.has_code?"****":""}</td>
    </tr>`).join("");
    return `<div class="grid-wrap"><p>Showing first 50 of 128 users</p><table><thead><tr><th>#</th><th>Level</th><th>Partitions</th><th>Name</th><th>Code</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  _renderOptions() {
    const o = this._options;
    return `<div>
      <h3>Alarm User Settings</h3>
      <div class="form-row"><label>Code Type</label>
        <select id="code-type"><option value="numeric">Numeric</option><option value="alphanumeric">Alphanumeric</option></select></div>
      <div class="form-row"><label>Code Length</label><input id="code-len" type="number" min="4" max="16" value="${o.alarm_user_code_length||4}"/></div>
      <h3>Zone Options</h3>
      <div class="form-row"><label>Default Debounce (ms)</label><input id="deb-ms" type="number" value="${o.default_delay_milliseconds||250}"/></div>
      <div class="form-row"><label>Entry Delay 1 (s)</label><input id="ed1" type="number" min="10" max="300" value="${o.intrusion_entry_delay_1_seconds||30}"/></div>
      <div class="form-row"><label>Entry Delay 2 (s)</label><input id="ed2" type="number" min="10" max="300" value="${o.intrusion_entry_delay_2_seconds||60}"/></div>
      <h3>Developer Options</h3>
      <div class="form-row"><label>Developer Options</label>
        <select id="dev-opt"><option value="false">Disabled</option><option value="true">Enabled</option></select></div>
      <div class="form-row"><label>Zone Test Tool</label>
        <select id="zone-test"><option value="disabled">Disabled</option><option value="enabled">Enabled</option></select></div>
      <button id="save-options">Save Options</button>
    </div>`;
  }

  async _saveOptions() {
    const root = this.shadowRoot;
    const opts = { ...this._options };
    opts.alarm_user_code_type = root.querySelector("#code-type").value;
    opts.alarm_user_code_length = parseInt(root.querySelector("#code-len").value);
    opts.default_delay_milliseconds = parseInt(root.querySelector("#deb-ms").value);
    opts.intrusion_entry_delay_1_seconds = parseInt(root.querySelector("#ed1").value);
    opts.intrusion_entry_delay_2_seconds = parseInt(root.querySelector("#ed2").value);
    opts.developer_options_enabled = root.querySelector("#dev-opt").value === "true";
    opts.zone_test_tool = root.querySelector("#zone-test").value;
    await this._call("alarm_zone_manager/update_options", { options: opts });
    await this._loadAll();
  }

  _renderLog() {
    const rows = this._log.map(e => `<tr>
      <td>${e.sequential_id}</td><td>${e.date}</td><td>${e.time}</td>
      <td>${e.event_type_label||e.event_type}</td>
      <td>${e.zone_id||""}</td><td>${e.zone_name||""}</td>
    </tr>`).join("");
    return `<div class="toolbar">
      <button id="reset-log">Reset Log</button>
      <button id="export-log">Export Log</button>
    </div>
    <div class="grid-wrap"><table><thead><tr>
      <th>ID</th><th>Date</th><th>Time</th><th>Event Type</th><th>Zone #</th><th>Zone Name</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  async _resetLog() {
    await this._call("alarm_zone_manager/reset_event_log");
    await this._loadAll();
  }

  async _exportLog() {
    const r = await this._call("alarm_zone_manager/export_event_log");
    const blob = new Blob([r.content], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = r.filename;
    a.click();
    await this._loadAll();
  }
}

customElements.define("alarm-zone-panel", AlarmZonePanel);
