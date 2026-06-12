(() => {
  "use strict";

const ZONES_PER_PAGE = 128;
const TOTAL_ZONE_PAGES = 8;
const MIN_PARTITION = 1;
const MAX_PARTITION = 32;

const INTRUSION_TYPES = [
  { value: "entry_delay_1", label: "Entry Delay 1" },
  { value: "entry_delay_2", label: "Entry Delay 2" },
  { value: "interior_follower", label: "Interior Follower" },
  { value: "instant", label: "Instant" },
  { value: "24_hour_panic", label: "24 Hour Panic" },
  { value: "24_hour_medical", label: "24 Hour Medical" },
  { value: "momentary_arming_switch", label: "Momentary Arming Switch" },
  { value: "maintained_arming_switch", label: "Maintained Arming Switch" },
];

const FIRE_TYPES = [
  { value: "fire_smoke", label: "Smoke" },
  { value: "fire_heat", label: "Heat" },
  { value: "fire_pull", label: "Pull" },
  { value: "fire_waterflow", label: "Waterflow" },
  { value: "fire_trouble", label: "Trouble" },
  { value: "fire_supervisory", label: "Supervisory" },
];

const ACTION_OPTIONS = [
  { value: "disabled", label: "Disabled" },
  { value: "mirror", label: "Mirror" },
  { value: "pulse", label: "Pulse" },
  { value: "activate", label: "Activate" },
];

const INPUT_DOMAINS = [
  "binary_sensor",
  "sensor",
  "device_tracker",
  "input_boolean",
  "input_button",
  "cover",
  "lock",
];

const OUTPUT_DOMAINS = [
  "switch",
  "light",
  "siren",
  "input_boolean",
  "fan",
  "cover",
  "lock",
  "valve",
];

const ACTIVATE_DOMAINS = ["automation", "script", "scene"];

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
    this._editDraft = null;
    this._zonePage = 1;
    this._partitionModalOpen = false;
    this._partitionModalSelection = new Set();
    this._saveError = null;
    this._error = null;
    try {
      this.attachShadow({ mode: "open" });
      this._renderLoading();
    } catch (err) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.innerHTML = `<pre>Panel failed to initialize: ${err.message}</pre>`;
    }
  }

  connectedCallback() {
    super.connectedCallback();
    if (!this._loaded && !this._error) {
      this._renderLoading();
    }
  }

  set hass(hass) {
    this._hass = hass;
    if (this.shadowRoot) {
      this.shadowRoot.querySelectorAll("ha-entity-picker").forEach((picker) => {
        picker.hass = hass;
      });
    }
    if (!this._loaded) {
      this._loaded = true;
      this._loadAll();
    }
  }

  async _call(type, extra = {}) {
    return this._hass.callWS({ type, ...extra });
  }

  async _loadAll() {
    this._error = null;
    this._renderLoading();
    try {
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
    } catch (err) {
      this._error = err?.message || String(err);
      this._renderError();
    }
  }

  _esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  _zonePageSlice() {
    const start = (this._zonePage - 1) * ZONES_PER_PAGE;
    return this._zones.slice(start, start + ZONES_PER_PAGE);
  }

  _zonePageRangeLabel() {
    const start = (this._zonePage - 1) * ZONES_PER_PAGE + 1;
    const end = Math.min(this._zonePage * ZONES_PER_PAGE, 1024);
    return `Zones ${start}-${end}`;
  }

  _partitionLabel(partition) {
    if (!partition || partition === "disabled") {
      return "None";
    }
    const part = this._partitions.find(
      (p) => String(p.partition_id) === String(partition)
    );
    const name = part?.partition_name ? ` - ${part.partition_name}` : "";
    return `Partition ${partition}${name}`;
  }

  _optionsHtml(items, selected) {
    return items
      .map(
        (item) =>
          `<option value="${item.value}"${
            item.value === selected ? " selected" : ""
          }>${this._esc(item.label)}</option>`
      )
      .join("");
  }

  _renderLoading() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <style>${this._style()}</style>
      <div class="status">Loading Alarm Zones...</div>
    `;
  }

  _renderError() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <style>${this._style()}</style>
      <div class="status error">
        <p>Unable to load Alarm Zone Manager.</p>
        <p>${this._esc(this._error)}</p>
        <p>Ensure the integration is configured under Settings → Devices &amp; services, then reload the page.</p>
        <button id="retry-load">Retry</button>
      </div>
    `;
    const retry = this.shadowRoot.querySelector("#retry-load");
    if (retry) {
      retry.onclick = () => {
        this._loaded = false;
        if (this._hass) {
          this._loaded = true;
          this._loadAll();
        } else {
          this._renderLoading();
        }
      };
    }
  }

  _style() {
    return `
      :host {
        display: block;
        min-height: 100%;
        padding: 16px;
        font-family: Roboto, sans-serif;
        background-color: var(--primary-background-color, #fafafa);
        color: var(--primary-text-color, #212121);
        box-sizing: border-box;
      }
      .panel-root {
        min-height: 100%;
        background-color: var(--primary-background-color, #fafafa);
        color: var(--primary-text-color, #212121);
      }
      .status { padding: 24px; font-size: 16px; }
      .status.error p { margin: 8px 0; }
      .tabs { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
      .tab {
        padding:8px 14px;
        border:1px solid var(--divider-color, #ccc);
        background:var(--card-background-color, #f5f5f5);
        color:var(--primary-text-color, #212121);
        cursor:pointer;
        border-radius:4px;
      }
      .tab.active {
        background:var(--primary-color, #1976d2);
        color:var(--text-primary-color, #fff);
        border-color:var(--primary-color, #1976d2);
      }
      table { width:100%; border-collapse:collapse; font-size:13px; }
      th, td {
        border:1px solid var(--divider-color, #ddd);
        padding:6px 8px;
        text-align:left;
        vertical-align: top;
      }
      th {
        background:var(--table-header-background-color, #e0e0e0);
        color:var(--primary-text-color, #212121);
        position:sticky;
        top:0;
        z-index: 1;
      }
      tr:nth-child(even) { background:var(--table-row-background-color, #f5f5f5); }
      tr:nth-child(odd) { background:var(--card-background-color, #ebebeb); }
      tr.editing { background:var(--state-inactive-color, #e3f2fd) !important; }
      .invalid { color:var(--error-color, #c62828); }
      .grayed { color:var(--secondary-text-color, #888); opacity:0.85; }
      input, select {
        box-sizing:border-box;
        background:var(--card-background-color, #fff);
        color:var(--primary-text-color, #212121);
        border:1px solid var(--divider-color, #ccc);
        padding: 6px 8px;
        border-radius: 4px;
      }
      .toolbar { margin-bottom:10px; display:flex; gap:8px; flex-wrap: wrap; align-items: center; }
      button, .btn {
        padding:6px 12px;
        cursor:pointer;
        background:var(--primary-color, #1976d2);
        color:var(--text-primary-color, #fff);
        border:none;
        border-radius:4px;
      }
      button.secondary, .btn.secondary {
        background: var(--card-background-color, #eee);
        color: var(--primary-text-color, #212121);
        border: 1px solid var(--divider-color, #ccc);
      }
      button.page-btn {
        min-width: 36px;
      }
      button.page-btn.active {
        font-weight: bold;
        box-shadow: inset 0 0 0 2px var(--text-primary-color, #fff);
      }
      .grid-wrap { max-height:70vh; overflow:auto; }
      .form-row { margin:8px 0; display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
      .form-row label { min-width:160px; font-weight: 500; }
      .form-row input[type="text"], .form-row input[type="number"], .form-row select {
        flex: 1;
        min-width: 200px;
        max-width: 420px;
      }
      .picker-host {
        flex: 1;
        min-width: 280px;
        max-width: 520px;
      }
      .picker-host ha-entity-picker {
        display: block;
        width: 100%;
      }
      .edit-form {
        padding: 12px 4px;
      }
      .edit-actions {
        margin-top: 12px;
        display: flex;
        gap: 8px;
      }
      .save-error {
        color: var(--error-color, #c62828);
        margin: 8px 0;
      }
      .pagination {
        margin-top: 12px;
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        align-items: center;
      }
      .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
      .modal {
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color, #212121);
        border-radius: 8px;
        padding: 20px;
        width: min(640px, 92vw);
        max-height: 85vh;
        overflow: auto;
        box-shadow: 0 8px 32px rgba(0,0,0,0.25);
      }
      .modal h3 { margin: 0 0 12px; }
      .partition-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 8px;
        margin: 12px 0;
      }
      .partition-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        border: 1px solid var(--divider-color, #ddd);
        border-radius: 4px;
        background: var(--table-row-background-color, #fafafa);
      }
      .modal-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 12px;
      }
      .page-info { margin: 0 0 8px; font-size: 14px; }
      .pulse-fields {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        align-items: center;
      }
      .pulse-fields label {
        min-width: auto;
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: normal;
      }
    `;
  }

  _render() {
    if (!this.shadowRoot) return;
    const content =
      this._tab === "zones"
        ? this._renderZones()
        : this._tab === "partitions"
          ? this._renderPartitions()
          : this._tab === "keypads"
            ? this._renderKeypads()
            : this._tab === "users"
              ? this._renderUsers()
              : this._tab === "options"
                ? this._renderOptions()
                : this._renderLog();

    const modal = this._partitionModalOpen ? this._renderPartitionModal() : "";

    this.shadowRoot.innerHTML = `
      <style>${this._style()}</style>
      <div class="panel-root">
      <div class="tabs">
        ${["zones", "partitions", "keypads", "users", "options", "log"]
          .map(
            (t) => `
          <div class="tab ${this._tab === t ? "active" : ""}" data-tab="${t}">${
            t === "users"
              ? "Alarm Users"
              : t === "log"
                ? "Event Log"
                : t.charAt(0).toUpperCase() + t.slice(1)
          }</div>
        `
          )
          .join("")}
      </div>
      ${content}
      </div>
      ${modal}
    `;
    this._bind();
    if (this._tab === "zones" && this._editDraft) {
      this._mountEntityPickers();
    }
  }

  _bind() {
    this.shadowRoot.querySelectorAll(".tab").forEach((el) => {
      el.onclick = () => {
        this._tab = el.dataset.tab;
        this._cancelEdit();
        this._render();
      };
    });

    const saveOpt = this.shadowRoot.querySelector("#save-options");
    if (saveOpt) saveOpt.onclick = () => this._saveOptions();

    const resetLog = this.shadowRoot.querySelector("#reset-log");
    if (resetLog) resetLog.onclick = () => this._resetLog();

    const exportLog = this.shadowRoot.querySelector("#export-log");
    if (exportLog) exportLog.onclick = () => this._exportLog();

    this.shadowRoot.querySelectorAll("[data-edit-zone]").forEach((el) => {
      el.onclick = () => this._startEdit(parseInt(el.dataset.editZone, 10));
    });

    this.shadowRoot.querySelectorAll("[data-save-zone]").forEach((el) => {
      el.onclick = () => this._saveZone(parseInt(el.dataset.saveZone, 10));
    });

    this.shadowRoot.querySelectorAll("[data-cancel-zone]").forEach((el) => {
      el.onclick = () => this._cancelEdit();
    });

    this.shadowRoot.querySelectorAll("[data-test-zone]").forEach((el) => {
      el.onclick = () => this._testZone(parseInt(el.dataset.testZone, 10));
    });

    this.shadowRoot.querySelectorAll("[data-zone-page]").forEach((el) => {
      el.onclick = () => {
        this._zonePage = parseInt(el.dataset.zonePage, 10);
        this._cancelEdit();
        this._render();
      };
    });

    this.shadowRoot.querySelectorAll("[data-open-partition-modal]").forEach((el) => {
      el.onclick = () => this._openPartitionModal();
    });

    const zoneType = this.shadowRoot.querySelector("#edit-zone-type");
    if (zoneType) {
      zoneType.onchange = () => {
        this._editDraft.zone_type = zoneType.value;
        if (zoneType.value === "automation") {
          this._editDraft.partition = "disabled";
        }
        this._render();
      };
    }

    const actionSel = this.shadowRoot.querySelector("#edit-action");
    if (actionSel) {
      actionSel.onchange = () => {
        this._editDraft.action = actionSel.value;
        this._render();
      };
    }

    this._bindPartitionModal();
  }

  _startEdit(zoneId) {
    const zone = this._zones.find((z) => z.zone_id === zoneId);
    if (!zone) return;
    this._editingZone = zoneId;
    this._editDraft = JSON.parse(JSON.stringify(zone));
    this._saveError = null;
    this._render();
  }

  _cancelEdit() {
    this._editingZone = null;
    this._editDraft = null;
    this._saveError = null;
    this._partitionModalOpen = false;
  }

  _openPartitionModal() {
    if (!this._editDraft) return;
    this._partitionModalOpen = true;
    this._partitionModalSelection = new Set();
    const part = this._editDraft.partition;
    if (part && part !== "disabled") {
      this._partitionModalSelection.add(parseInt(part, 10));
    }
    this._render();
  }

  _closePartitionModal() {
    this._partitionModalOpen = false;
    this._render();
  }

  _renderPartitionModal() {
    const items = [];
    for (let pid = MIN_PARTITION; pid <= MAX_PARTITION; pid += 1) {
      const part = this._partitions.find((p) => p.partition_id === pid);
      const label = part?.partition_name
        ? `Partition ${pid} - ${part.partition_name}`
        : `Partition ${pid}`;
      const checked = this._partitionModalSelection.has(pid) ? "checked" : "";
      items.push(`
        <label class="partition-item">
          <input type="checkbox" data-partition-id="${pid}" ${checked} />
          <span>${this._esc(label)}</span>
        </label>
      `);
    }

    return `
      <div class="modal-overlay" id="partition-modal-overlay">
        <div class="modal">
          <h3>Select Zone Partition</h3>
          <p>Select one partition for this zone. Leave all unchecked for no partition.</p>
          <div class="partition-grid">${items.join("")}</div>
          <div class="modal-actions">
            <button type="button" id="partition-check-all">Check All Partitions</button>
            <button type="button" id="partition-uncheck-all" class="secondary">Uncheck All Partitions</button>
            <button type="button" id="partition-save">Save</button>
            <button type="button" id="partition-cancel" class="secondary">Cancel</button>
          </div>
        </div>
      </div>
    `;
  }

  _bindPartitionModal() {
    if (!this._partitionModalOpen) return;

    this.shadowRoot.querySelectorAll("[data-partition-id]").forEach((el) => {
      el.onchange = () => {
        const pid = parseInt(el.dataset.partitionId, 10);
        if (el.checked) {
          this._partitionModalSelection.clear();
          this._partitionModalSelection.add(pid);
          this.shadowRoot.querySelectorAll("[data-partition-id]").forEach((other) => {
            if (other !== el) other.checked = false;
          });
        } else {
          this._partitionModalSelection.delete(pid);
        }
      };
    });

    const checkAll = this.shadowRoot.querySelector("#partition-check-all");
    if (checkAll) {
      checkAll.onclick = () => {
        this._partitionModalSelection = new Set(
          Array.from({ length: MAX_PARTITION }, (_, i) => i + MIN_PARTITION)
        );
        this._render();
      };
    }

    const uncheckAll = this.shadowRoot.querySelector("#partition-uncheck-all");
    if (uncheckAll) {
      uncheckAll.onclick = () => {
        this._partitionModalSelection.clear();
        this._render();
      };
    }

    const save = this.shadowRoot.querySelector("#partition-save");
    if (save) {
      save.onclick = () => {
        const selected = [...this._partitionModalSelection].sort((a, b) => a - b);
        if (selected.length > 1) {
          window.alert(
            "A zone can belong to only one partition. Uncheck partitions until exactly one remains selected, or use Uncheck All for no partition."
          );
          return;
        }
        if (selected.length === 0) {
          this._editDraft.partition = "disabled";
        } else {
          this._editDraft.partition = String(selected[0]);
        }
        this._partitionModalOpen = false;
        this._render();
      };
    }

    const cancel = this.shadowRoot.querySelector("#partition-cancel");
    if (cancel) {
      cancel.onclick = () => this._closePartitionModal();
    }

    const overlay = this.shadowRoot.querySelector("#partition-modal-overlay");
    if (overlay) {
      overlay.onclick = (ev) => {
        if (ev.target === overlay) this._closePartitionModal();
      };
    }
  }

  _mountEntityPickers() {
    if (!this._hass || !this._editDraft) return;
    const zid = this._editDraft.zone_id;

    this._mountPicker(
      `input-picker-${zid}`,
      this._editDraft.input_entity_id,
      INPUT_DOMAINS,
      (val) => {
        this._editDraft.input_entity_id = val || null;
      }
    );

    this._mountPicker(
      `output-picker-${zid}`,
      this._editDraft.output_entity_id,
      OUTPUT_DOMAINS,
      (val) => {
        this._editDraft.output_entity_id = val || null;
      }
    );

    if (this._editDraft.action === "activate") {
      this._mountPicker(
        `activate-picker-${zid}`,
        this._editDraft.activate_entity_id,
        ACTIVATE_DOMAINS,
        (val) => {
          this._editDraft.activate_entity_id = val || null;
        }
      );
    }
  }

  _mountPicker(hostId, value, domains, onChange) {
    const host = this.shadowRoot.querySelector(`#${hostId}`);
    if (!host || !this._hass) return;
    host.innerHTML = "";
    const picker = document.createElement("ha-entity-picker");
    picker.hass = this._hass;
    picker.value = value || "";
    picker.includeDomains = domains;
    picker.allowCustomEntity = false;
    picker.style.display = "block";
    picker.style.width = "100%";
    picker.addEventListener("value-changed", (ev) => {
      onChange(ev.detail.value);
    });
    host.appendChild(picker);
  }

  _renderZoneEditRow(zone) {
    const zid = zone.zone_id;
    const draft = this._editDraft;
    const isIntrusion = draft.zone_type === "intrusion_alarm";
    const isFire = draft.zone_type === "fire_alarm";
    const showPartition = isIntrusion || isFire;
    const colspan = this._zoneTestEnabled ? 13 : 12;

    const intrusionSelect = isIntrusion
      ? `<div class="form-row"><label>Intrusion Type</label>
          <select id="edit-intrusion-type">${this._optionsHtml(INTRUSION_TYPES, draft.intrusion_type)}</select>
        </div>`
      : "";

    const fireSelect = isFire
      ? `<div class="form-row"><label>Fire Type</label>
          <select id="edit-fire-type">${this._optionsHtml(FIRE_TYPES, draft.fire_type)}</select>
        </div>`
      : "";

    const partitionRow = showPartition
      ? `<div class="form-row"><label>Partition</label>
          <button type="button" class="btn secondary" data-open-partition-modal>
            ${this._esc(this._partitionLabel(draft.partition))}
          </button>
        </div>`
      : "";

    const activateRow =
      draft.action === "activate"
        ? `<div class="form-row"><label>Activate Entity</label>
            <div class="picker-host" id="activate-picker-${zid}"></div>
          </div>`
        : "";

    const pulseRow =
      draft.action === "pulse"
        ? `<div class="form-row"><label>Pulse Duration</label>
            <div class="pulse-fields">
              <label>H <input id="edit-pulse-hours" type="number" min="0" max="99" value="${draft.pulse_hours ?? 0}" style="width:70px"/></label>
              <label>M <input id="edit-pulse-minutes" type="number" min="0" max="59" value="${draft.pulse_minutes ?? 0}" style="width:70px"/></label>
              <label>S <input id="edit-pulse-seconds" type="number" min="0" max="59" value="${draft.pulse_seconds ?? 30}" style="width:70px"/></label>
            </div>
          </div>`
        : "";

    const saveError = this._saveError
      ? `<div class="save-error">${this._esc(this._saveError)}</div>`
      : "";

    return `<tr class="editing"><td colspan="${colspan}">
      <div class="edit-form">
        <div class="form-row"><label>Zone Name</label>
          <input id="edit-zone-name" type="text" maxlength="32" value="${this._esc(draft.zone_name)}" />
        </div>
        <div class="form-row"><label>Zone Type</label>
          <select id="edit-zone-type">
            <option value="automation"${draft.zone_type === "automation" ? " selected" : ""}>Automation</option>
            <option value="intrusion_alarm"${draft.zone_type === "intrusion_alarm" ? " selected" : ""}>Intrusion Alarm</option>
            <option value="fire_alarm"${draft.zone_type === "fire_alarm" ? " selected" : ""}>Fire Alarm</option>
          </select>
        </div>
        <div class="form-row"><label>Input Entity</label>
          <div class="picker-host" id="input-picker-${zid}"></div>
        </div>
        ${intrusionSelect}
        ${fireSelect}
        <div class="form-row"><label>Debounce (ms)</label>
          <input id="edit-debounce" type="number" min="0" max="999" value="${draft.delay_milliseconds ?? 250}" />
        </div>
        <div class="form-row"><label>Output Entity</label>
          <div class="picker-host" id="output-picker-${zid}"></div>
        </div>
        <div class="form-row"><label>Action</label>
          <select id="edit-action">${this._optionsHtml(ACTION_OPTIONS, draft.action || "disabled")}</select>
        </div>
        ${activateRow}
        ${pulseRow}
        ${partitionRow}
        ${saveError}
        <div class="edit-actions">
          <button type="button" data-save-zone="${zid}">Save</button>
          <button type="button" class="secondary" data-cancel-zone="${zid}">Cancel</button>
        </div>
      </div>
    </td></tr>`;
  }

  _formatPulseDuration(zone) {
    const h = zone.pulse_hours || 0;
    const m = zone.pulse_minutes || 0;
    const s = zone.pulse_seconds ?? 30;
    return `${h}h ${m}m ${s}s`;
  }

  _renderZones() {
    const testCol = this._zoneTestEnabled ? `<th>Test</th>` : "";
    const pageZones = this._zonePageSlice();
    const rows = pageZones
      .map((z) => {
        if (this._editingZone === z.zone_id && this._editDraft) {
          return this._renderZoneEditRow(z);
        }

        const testCell = this._zoneTestEnabled
          ? `<td><button data-test-zone="${z.zone_id}">Activate</button>
              <input type="number" id="dur-${z.zone_id}" value="5" min="0.1" max="300" step="0.1" style="width:60px"/></td>`
          : "";

        return `<tr>
          ${testCell}
          <td>${z.zone_id}</td>
          <td>${this._esc(z.zone_name)}</td>
          <td>${this._esc(z.input_entity_id || "")}</td>
          <td>${this._esc(z.zone_type)}</td>
          <td class="${z.intrusion_type_editable ? "" : "grayed"}">${this._esc(z.intrusion_type || "")}</td>
          <td class="${z.fire_type_editable ? "" : "grayed"}">${this._esc(z.fire_type || "")}</td>
          <td>${z.delay_milliseconds}ms</td>
          <td>${this._esc(z.output_entity_id || "")}</td>
          <td>${this._esc(z.output_action_display || z.action || "")}${
            (z.output_action_display || z.action) === "pulse"
              ? ` (${this._formatPulseDuration(z)})`
              : ""
          }</td>
          <td class="${z.partition_editable ? "" : "grayed"}">${this._esc(z.partition)}</td>
          <td><button data-edit-zone="${z.zone_id}">Edit</button></td>
        </tr>`;
      })
      .join("");

    const pageButtons = Array.from({ length: TOTAL_ZONE_PAGES }, (_, i) => {
      const page = i + 1;
      return `<button type="button" class="page-btn${page === this._zonePage ? " active" : ""}" data-zone-page="${page}">${page}</button>`;
    }).join("");

    return `
      <p class="page-info">Page ${this._zonePage} of ${TOTAL_ZONE_PAGES} — ${this._zonePageRangeLabel()} of 1024 zones</p>
      <div class="grid-wrap">
        <table>
          <thead><tr>
            ${testCol}
            <th>Zone</th><th>Name</th><th>Input</th><th>Type</th>
            <th>Intrusion Type</th><th>Fire Type</th><th>Debounce</th>
            <th>Output</th><th>Action</th><th>Partition</th><th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="pagination">
        <span>Pages:</span>
        ${pageButtons}
      </div>
    `;
  }

  _collectEditDraftFromForm(zoneId) {
    const draft = { ...this._editDraft };
    const nameEl = this.shadowRoot.querySelector("#edit-zone-name");
    const typeEl = this.shadowRoot.querySelector("#edit-zone-type");
    const debEl = this.shadowRoot.querySelector("#edit-debounce");
    const actionEl = this.shadowRoot.querySelector("#edit-action");
    const intrusionEl = this.shadowRoot.querySelector("#edit-intrusion-type");
    const fireEl = this.shadowRoot.querySelector("#edit-fire-type");
    const pulseHoursEl = this.shadowRoot.querySelector("#edit-pulse-hours");
    const pulseMinutesEl = this.shadowRoot.querySelector("#edit-pulse-minutes");
    const pulseSecondsEl = this.shadowRoot.querySelector("#edit-pulse-seconds");

    if (nameEl) draft.zone_name = nameEl.value.trim();
    if (typeEl) draft.zone_type = typeEl.value;
    if (debEl) draft.delay_milliseconds = parseInt(debEl.value, 10) || 0;
    if (actionEl) draft.action = actionEl.value;
    if (intrusionEl) draft.intrusion_type = intrusionEl.value;
    if (fireEl) draft.fire_type = fireEl.value;
    if (pulseHoursEl) draft.pulse_hours = parseInt(pulseHoursEl.value, 10) || 0;
    if (pulseMinutesEl) draft.pulse_minutes = parseInt(pulseMinutesEl.value, 10) || 0;
    if (pulseSecondsEl) draft.pulse_seconds = parseInt(pulseSecondsEl.value, 10) || 0;

    if (draft.zone_type === "automation") {
      draft.partition = "disabled";
    }

    draft.zone_id = zoneId;
    return draft;
  }

  async _saveZone(zoneId) {
    if (!this._editDraft || this._editDraft.zone_id !== zoneId) return;
    this._saveError = null;
    const zone = this._collectEditDraftFromForm(zoneId);
    const payload = { ...zone };
    delete payload.partition_editable;
    delete payload.intrusion_type_editable;
    delete payload.fire_type_editable;
    delete payload.output_action_editable;
    delete payload.output_action_display;

    try {
      await this._call("alarm_zone_manager/update_zone", { zone: payload });
      this._cancelEdit();
      await this._loadAll();
    } catch (err) {
      this._saveError = err?.message || String(err);
      this._editDraft = zone;
      this._editingZone = zoneId;
      this._render();
    }
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
    const rows = this._partitions
      .map(
        (p) => `<tr>
      <td>${p.partition_id}</td>
      <td>${this._esc(p.partition_name || "")}</td>
      <td class="${p.alarm_account_editable ? "" : "grayed"}">${this._esc(p.alarm_account)}</td>
      <td>${this._esc(p.activation_action)}</td>
    </tr>`
      )
      .join("");
    return `<div class="grid-wrap"><table><thead><tr><th>Partition</th><th>Name</th><th>Alarm Account</th><th>Activation Action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  _renderKeypads() {
    const rows = this._keypads
      .map(
        (k) => `<tr>
      <td>${k.keypad_id}</td>
      <td>${k.enabled}</td>
      <td>${(k.partition_ids || []).join(",")}</td>
      <td>${k.keypad_type}</td>
      <td>${this._esc(k.keypad_name)}</td>
    </tr>`
      )
      .join("");
    return `<div class="grid-wrap"><table><thead><tr><th>ID</th><th>Enable</th><th>Partitions</th><th>Type</th><th>Name</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  _renderUsers() {
    const rows = this._users
      .slice(0, 50)
      .map(
        (u) => `<tr>
      <td>${u.user_number}</td>
      <td>${u.user_level}</td>
      <td>${(u.partition_ids || []).length} partitions</td>
      <td>${this._esc(u.user_name || "")}</td>
      <td>${u.has_code ? "****" : ""}</td>
    </tr>`
      )
      .join("");
    return `<div class="grid-wrap"><p>Showing first 50 of 128 users</p><table><thead><tr><th>#</th><th>Level</th><th>Partitions</th><th>Name</th><th>Code</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  _renderOptions() {
    const o = this._options;
    return `<div>
      <h3>Alarm User Settings</h3>
      <div class="form-row"><label>Code Type</label>
        <select id="code-type"><option value="numeric">Numeric</option><option value="alphanumeric">Alphanumeric</option></select></div>
      <div class="form-row"><label>Code Length</label><input id="code-len" type="number" min="4" max="16" value="${o.alarm_user_code_length || 4}"/></div>
      <h3>Zone Options</h3>
      <div class="form-row"><label>Default Debounce (ms)</label><input id="deb-ms" type="number" value="${o.default_delay_milliseconds || 250}"/></div>
      <div class="form-row"><label>Entry Delay 1 (s)</label><input id="ed1" type="number" min="10" max="300" value="${o.intrusion_entry_delay_1_seconds || 30}"/></div>
      <div class="form-row"><label>Entry Delay 2 (s)</label><input id="ed2" type="number" min="10" max="300" value="${o.intrusion_entry_delay_2_seconds || 60}"/></div>
      <h3>Developer Options</h3>
      <div class="form-row"><label>Developer Options</label>
        <select id="dev-opt"><option value="false">Disabled</option><option value="true">Enabled</option></select></div>
      <div class="form-row"><label>Zone Test Tool</label>
        <select id="zone-test"><option value="disabled">Disabled</option><option value="enabled">Enabled</option></select></div>
      <button id="save-options">Save Options</button>
    </div>`;
  }

  async _saveOptions() {
    const opts = { ...this._options };
    opts.alarm_user_code_type = this.shadowRoot.querySelector("#code-type").value;
    opts.alarm_user_code_length = parseInt(this.shadowRoot.querySelector("#code-len").value, 10);
    opts.default_delay_milliseconds = parseInt(this.shadowRoot.querySelector("#deb-ms").value, 10);
    opts.intrusion_entry_delay_1_seconds = parseInt(this.shadowRoot.querySelector("#ed1").value, 10);
    opts.intrusion_entry_delay_2_seconds = parseInt(this.shadowRoot.querySelector("#ed2").value, 10);
    opts.developer_options_enabled = this.shadowRoot.querySelector("#dev-opt").value === "true";
    opts.zone_test_tool = this.shadowRoot.querySelector("#zone-test").value;
    await this._call("alarm_zone_manager/update_options", { options: opts });
    await this._loadAll();
  }

  _renderLog() {
    const rows = this._log
      .map(
        (e) => `<tr>
      <td>${e.sequential_id}</td><td>${this._esc(e.date)}</td><td>${this._esc(e.time)}</td>
      <td>${this._esc(e.event_type_label || e.event_type)}</td>
      <td>${e.zone_id || ""}</td><td>${this._esc(e.zone_name || "")}</td>
    </tr>`
      )
      .join("");
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

if (!customElements.get("alarm-zone-panel")) {
  customElements.define("alarm-zone-panel", AlarmZonePanel);
}

})();
