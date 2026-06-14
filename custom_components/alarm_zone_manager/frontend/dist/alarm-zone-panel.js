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
    { value: "mirror", label: "Follow Input" },
    { value: "pulse", label: "Pulse" },
    { value: "activate", label: "Trigger Automation" },
  ];

  const USER_LEVELS = [
    { value: "disabled", label: "Disabled" },
    { value: "user", label: "User" },
    { value: "manager", label: "Manager" },
    { value: "installer", label: "Installer" },
  ];

  const KEYPAD_TYPES = [
    { value: "intrusion_alarm", label: "Intrusion Alarm" },
    { value: "fire_alarm", label: "Fire Alarm" },
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

  const ZONE_EDIT_HELP = `
    <p><strong>Zone Name:</strong> 32 character alphanumeric name.</p>
    <p><strong>Zone Type:</strong><br/>
      <em>Automation:</em> Select for general automation.<br/>
      <em>Intrusion Alarm:</em> Select for burglary, hold up/auxillary alarm input.<br/>
      <em>Fire Alarm:</em> Select for fire or other life safety alarm input.</p>
    <p><strong>Input Entity:</strong> Select Input Entity/Switch/Sensor or other input device.</p>
    <p><strong>Debounce/Alarm Delay:</strong> Select the duration the input must be in an active alarm state before the output action gets triggered.</p>
    <p><strong>Output Entity:</strong> Select output Entity/Relay/Smart Plug or other output device.</p>
    <p><strong>Action:</strong><br/>
      <em>Follow Input:</em> Activate the output whenever the input goes in the alarm state, deactivate whenever the input restores the alarm state.<br/>
      <em>Pulse:</em> Temporarily activate the output for a user defined duration in hours, minutes, seconds format from 1s to 99 hours and 59 minutes and 59 seconds.<br/>
      <em>Trigger Automation:</em> Select an Automation/Scene/Script Entity.</p>
  `;

  const actionLabel = (value) => {
    const item = ACTION_OPTIONS.find((o) => o.value === value);
    return item ? item.label : value || "";
  };

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
      this._zonePage = 1;
      this._saveError = null;
      this._error = null;

      this._editingZone = null;
      this._editDraft = null;

      this._editingPartition = null;
      this._editPartitionDraft = null;

      this._editingKeypad = null;
      this._editKeypadDraft = null;

      this._editingUser = null;
      this._editUserDraft = null;
      this._editUserCode = "";

      this._partitionModalOpen = false;
      this._partitionModalMulti = false;
      this._partitionModalContext = null;
      this._partitionModalSelection = new Set();

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
      if (!partition || partition === "disabled") return "None";
      const part = this._partitions.find(
        (p) => String(p.partition_id) === String(partition)
      );
      const name = part?.partition_name ? ` - ${part.partition_name}` : "";
      return `Partition ${partition}${name}`;
    }

    _partitionIdsLabel(ids) {
      const list = ids || [];
      if (!list.length) return "None";
      return list.join(", ");
    }

    _formatPulseDuration(obj) {
      const h = obj.pulse_hours || 0;
      const m = obj.pulse_minutes || 0;
      const s = obj.pulse_seconds ?? 30;
      return `${h}h ${m}m ${s}s`;
    }

    _clearEditState() {
      this._editingZone = null;
      this._editDraft = null;
      this._editingPartition = null;
      this._editPartitionDraft = null;
      this._editingKeypad = null;
      this._editKeypadDraft = null;
      this._editingUser = null;
      this._editUserDraft = null;
      this._editUserCode = "";
      this._saveError = null;
      this._partitionModalOpen = false;
      this._partitionModalContext = null;
    }

    _cancelAllEdits() {
      this._clearEditState();
      this._render();
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
          <button type="button" id="retry-load">Retry</button>
        </div>
      `;
      const retry = this.shadowRoot.querySelector("#retry-load");
      if (retry) retry.onclick = () => {
        this._loaded = false;
        if (this._hass) {
          this._loaded = true;
          this._loadAll();
        } else {
          this._renderLoading();
        }
      };
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
        .tabs { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
        .tab {
          padding:8px 14px;
          border:1px solid var(--divider-color, #ccc);
          background:var(--card-background-color, #f5f5f5);
          cursor:pointer;
          border-radius:4px;
        }
        .tab.active {
          background:var(--primary-color, #1976d2);
          color:var(--text-primary-color, #fff);
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
          position:sticky;
          top:0;
          z-index:1;
        }
        tr:nth-child(even) { background:var(--table-row-background-color, #f5f5f5); }
        tr:nth-child(odd) { background:var(--card-background-color, #ebebeb); }
        .grayed { color:var(--secondary-text-color, #888); opacity:0.85; }
        input, select {
          box-sizing:border-box;
          background:var(--card-background-color, #fff);
          color:var(--primary-text-color, #212121);
          border:1px solid var(--divider-color, #ccc);
          padding:6px 8px;
          border-radius:4px;
        }
        button, .btn {
          padding:6px 12px;
          cursor:pointer;
          background:var(--primary-color, #1976d2);
          color:var(--text-primary-color, #fff);
          border:none;
          border-radius:4px;
        }
        button.secondary, .btn.secondary {
          background:var(--card-background-color, #eee);
          color:var(--primary-text-color, #212121);
          border:1px solid var(--divider-color, #ccc);
        }
        .grid-wrap { max-height:70vh; overflow:auto; }
        .form-row {
          margin:8px 0;
          display:flex;
          gap:12px;
          align-items:center;
          flex-wrap:wrap;
        }
        .form-row label.field-label {
          min-width:160px;
          font-weight:500;
        }
        .form-row input[type="text"],
        .form-row input[type="number"],
        .form-row input[type="password"],
        .form-row select {
          flex:1;
          min-width:200px;
          max-width:420px;
        }
        .picker-host { flex:1; min-width:280px; max-width:520px; }
        .picker-host ha-entity-picker { display:block; width:100%; }
        .modal-overlay {
          position:fixed;
          inset:0;
          background:rgba(0,0,0,0.45);
          display:flex;
          align-items:center;
          justify-content:center;
          z-index:1000;
        }
        .modal {
          background:var(--card-background-color, #fff);
          color:var(--primary-text-color, #212121);
          border-radius:8px;
          padding:20px;
          width:min(920px, 96vw);
          max-height:90vh;
          overflow:auto;
          box-shadow:0 8px 32px rgba(0,0,0,0.25);
        }
        .modal.wide { width:min(1100px, 98vw); }
        .modal h2, .modal h3 { margin:0 0 12px; }
        .edit-two-pane {
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:20px;
          align-items:start;
        }
        @media (max-width: 860px) {
          .edit-two-pane { grid-template-columns:1fr; }
        }
        .help-pane {
          background:var(--table-row-background-color, #f5f5f5);
          border:1px solid var(--divider-color, #ddd);
          border-radius:6px;
          padding:14px;
          font-size:13px;
          line-height:1.5;
        }
        .help-pane p { margin:0 0 10px; }
        .edit-actions {
          margin-top:16px;
          display:flex;
          gap:8px;
          justify-content:flex-end;
        }
        .save-error {
          color:var(--error-color, #c62828);
          margin:8px 0;
        }
        .partition-grid {
          display:grid;
          grid-template-columns:repeat(auto-fill, minmax(140px, 1fr));
          gap:8px;
          margin:12px 0;
        }
        .partition-item {
          display:flex;
          align-items:center;
          gap:8px;
          padding:6px 8px;
          border:1px solid var(--divider-color, #ddd);
          border-radius:4px;
        }
        .modal-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
        .pagination { margin-top:12px; display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
        button.page-btn { min-width:36px; }
        button.page-btn.active { font-weight:bold; }
        .pulse-fields { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
        .pulse-fields label { min-width:auto; display:flex; align-items:center; gap:6px; font-weight:normal; }
        .page-info { margin:0 0 8px; font-size:14px; }
        .toolbar { margin-bottom:10px; display:flex; gap:8px; }
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

      const modals = [
        this._editingZone ? this._renderZoneEditModal() : "",
        this._editingPartition ? this._renderPartitionEditModal() : "",
        this._editingKeypad ? this._renderKeypadEditModal() : "",
        this._editingUser ? this._renderUserEditModal() : "",
        this._partitionModalOpen ? this._renderPartitionPickerModal() : "",
      ].join("");

      this.shadowRoot.innerHTML = `
        <style>${this._style()}</style>
        <div class="panel-root">
          <div class="tabs">
            ${["zones", "partitions", "keypads", "users", "options", "log"]
              .map(
                (t) =>
                  `<div class="tab ${this._tab === t ? "active" : ""}" data-tab="${t}">${
                    t === "users"
                      ? "Alarm Users"
                      : t === "log"
                        ? "Event Log"
                        : t.charAt(0).toUpperCase() + t.slice(1)
                  }</div>`
              )
              .join("")}
          </div>
          ${content}
        </div>
        ${modals}
      `;
      this._bind();
      this._mountEntityPickers();
    }

    _bind() {
      const root = this.shadowRoot;

      root.querySelectorAll(".tab").forEach((el) => {
        el.onclick = () => {
          this._tab = el.dataset.tab;
          this._cancelAllEdits();
        };
      });

      root.querySelector("#save-options")?.addEventListener("click", () => this._saveOptions());
      root.querySelector("#reset-log")?.addEventListener("click", () => this._resetLog());
      root.querySelector("#export-log")?.addEventListener("click", () => this._exportLog());

      root.querySelectorAll("[data-edit-zone]").forEach((el) => {
        el.addEventListener("click", () => this._startZoneEdit(parseInt(el.dataset.editZone, 10)));
      });
      root.querySelectorAll("[data-edit-partition]").forEach((el) => {
        el.addEventListener("click", () =>
          this._startPartitionEdit(parseInt(el.dataset.editPartition, 10))
        );
      });
      root.querySelectorAll("[data-edit-keypad]").forEach((el) => {
        el.addEventListener("click", () =>
          this._startKeypadEdit(parseInt(el.dataset.editKeypad, 10))
        );
      });
      root.querySelectorAll("[data-edit-user]").forEach((el) => {
        el.addEventListener("click", () =>
          this._startUserEdit(parseInt(el.dataset.editUser, 10))
        );
      });

      root.querySelector("#zone-save")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        this._saveZone();
      });
      root.querySelector("#zone-cancel")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        this._cancelAllEdits();
      });

      root.querySelector("#partition-save-btn")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        this._savePartition();
      });
      root.querySelector("#partition-cancel-btn")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        this._cancelAllEdits();
      });

      root.querySelector("#keypad-save-btn")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        this._saveKeypad();
      });
      root.querySelector("#keypad-cancel-btn")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        this._cancelAllEdits();
      });

      root.querySelector("#user-save-btn")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        this._saveUser();
      });
      root.querySelector("#user-cancel-btn")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        this._cancelAllEdits();
      });

      root.querySelectorAll("[data-test-zone]").forEach((el) => {
        el.addEventListener("click", () => this._testZone(parseInt(el.dataset.testZone, 10)));
      });
      root.querySelectorAll("[data-zone-page]").forEach((el) => {
        el.addEventListener("click", () => {
          this._zonePage = parseInt(el.dataset.zonePage, 10);
          this._cancelAllEdits();
        });
      });

      root.querySelector("#edit-zone-type")?.addEventListener("change", (ev) => {
        this._editDraft.zone_type = ev.target.value;
        if (ev.target.value === "automation") this._editDraft.partition = "disabled";
        this._render();
      });
      root.querySelector("#edit-action")?.addEventListener("change", (ev) => {
        this._editDraft.action = ev.target.value;
        this._render();
      });
      root.querySelector("#edit-partition-action")?.addEventListener("change", (ev) => {
        this._editPartitionDraft.activation_action = ev.target.value;
        this._render();
      });

      root.querySelector("[data-open-zone-partition]")?.addEventListener("click", () => {
        this._openPartitionPicker("zone", false);
      });
      root.querySelector("[data-open-keypad-partitions]")?.addEventListener("click", () => {
        this._openPartitionPicker("keypad", true);
      });
      root.querySelector("[data-open-user-partitions]")?.addEventListener("click", () => {
        this._openPartitionPicker("user", true);
      });

      this._bindPartitionPickerModal();
    }

    _startZoneEdit(zoneId) {
      const zone = this._zones.find((z) => z.zone_id === zoneId);
      if (!zone) return;
      this._clearEditState();
      this._editingZone = zoneId;
      this._editDraft = JSON.parse(JSON.stringify(zone));
      this._render();
    }

    _startPartitionEdit(partitionId) {
      const part = this._partitions.find((p) => p.partition_id === partitionId);
      if (!part) return;
      this._clearEditState();
      this._editingPartition = partitionId;
      this._editPartitionDraft = JSON.parse(JSON.stringify(part));
      this._render();
    }

    _startKeypadEdit(keypadId) {
      const keypad = this._keypads.find((k) => k.keypad_id === keypadId);
      if (!keypad) return;
      this._clearEditState();
      this._editingKeypad = keypadId;
      this._editKeypadDraft = JSON.parse(JSON.stringify(keypad));
      this._render();
    }

    _startUserEdit(userNumber) {
      const user = this._users.find((u) => u.user_number === userNumber);
      if (!user) return;
      this._clearEditState();
      this._editingUser = userNumber;
      this._editUserDraft = JSON.parse(JSON.stringify(user));
      this._editUserCode = "";
      this._render();
    }

    _openPartitionPicker(context, multi) {
      this._partitionModalOpen = true;
      this._partitionModalContext = context;
      this._partitionModalMulti = multi;
      this._partitionModalSelection = new Set();

      if (context === "zone" && this._editDraft?.partition && this._editDraft.partition !== "disabled") {
        this._partitionModalSelection.add(parseInt(this._editDraft.partition, 10));
      } else if (context === "keypad" && this._editKeypadDraft) {
        (this._editKeypadDraft.partition_ids || []).forEach((id) =>
          this._partitionModalSelection.add(parseInt(id, 10))
        );
      } else if (context === "user" && this._editUserDraft) {
        (this._editUserDraft.partition_ids || []).forEach((id) =>
          this._partitionModalSelection.add(parseInt(id, 10))
        );
      }
      this._render();
    }

    _renderPartitionPickerModal() {
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
      const title =
        this._partitionModalContext === "zone"
          ? "Select Zone Partition"
          : "Select Partitions";
      const hint = this._partitionModalMulti
        ? "Check all partitions this item may access. Use Uncheck All for none."
        : "Select one partition for this zone, or leave all unchecked for none.";

      return `
        <div class="modal-overlay" id="partition-picker-overlay">
          <div class="modal">
            <h3>${title}</h3>
            <p>${hint}</p>
            <div class="partition-grid">${items.join("")}</div>
            <div class="modal-actions">
              <button type="button" id="picker-check-all">Check All Partitions</button>
              <button type="button" id="picker-uncheck-all" class="secondary">Uncheck All Partitions</button>
              <button type="button" id="picker-save">Save</button>
              <button type="button" id="picker-cancel" class="secondary">Cancel</button>
            </div>
          </div>
        </div>
      `;
    }

    _bindPartitionPickerModal() {
      if (!this._partitionModalOpen) return;
      const root = this.shadowRoot;

      root.querySelectorAll("[data-partition-id]").forEach((el) => {
        el.addEventListener("change", () => {
          const pid = parseInt(el.dataset.partitionId, 10);
          if (el.checked) {
            if (!this._partitionModalMulti) {
              this._partitionModalSelection.clear();
              root.querySelectorAll("[data-partition-id]").forEach((other) => {
                if (other !== el) other.checked = false;
              });
            }
            this._partitionModalSelection.add(pid);
          } else {
            this._partitionModalSelection.delete(pid);
          }
        });
      });

      root.querySelector("#picker-check-all")?.addEventListener("click", () => {
        this._partitionModalSelection = new Set(
          Array.from({ length: MAX_PARTITION }, (_, i) => i + MIN_PARTITION)
        );
        this._render();
      });
      root.querySelector("#picker-uncheck-all")?.addEventListener("click", () => {
        this._partitionModalSelection.clear();
        this._render();
      });
      root.querySelector("#picker-save")?.addEventListener("click", () => {
        const selected = [...this._partitionModalSelection].sort((a, b) => a - b);
        if (this._partitionModalContext === "zone") {
          if (selected.length > 1) {
            window.alert("A zone can belong to only one partition.");
            return;
          }
          this._editDraft.partition = selected.length ? String(selected[0]) : "disabled";
        } else if (this._partitionModalContext === "keypad") {
          this._editKeypadDraft.partition_ids = selected;
        } else if (this._partitionModalContext === "user") {
          this._editUserDraft.partition_ids = selected;
        }
        this._partitionModalOpen = false;
        this._render();
      });
      root.querySelector("#picker-cancel")?.addEventListener("click", () => {
        this._partitionModalOpen = false;
        this._render();
      });
      root.querySelector("#partition-picker-overlay")?.addEventListener("click", (ev) => {
        if (ev.target.id === "partition-picker-overlay") {
          this._partitionModalOpen = false;
          this._render();
        }
      });
    }

    _renderPulseFields(prefix, draft) {
      return `
        <div class="form-row">
          <label class="field-label">Pulse Duration</label>
          <div class="pulse-fields">
            <label>H <input id="${prefix}-pulse-hours" type="number" min="0" max="99" value="${draft.pulse_hours ?? 0}" style="width:70px"/></label>
            <label>M <input id="${prefix}-pulse-minutes" type="number" min="0" max="59" value="${draft.pulse_minutes ?? 0}" style="width:70px"/></label>
            <label>S <input id="${prefix}-pulse-seconds" type="number" min="1" max="59" value="${draft.pulse_seconds ?? 30}" style="width:70px"/></label>
          </div>
        </div>
      `;
    }

    _renderZoneEditModal() {
      const draft = this._editDraft;
      const zid = draft.zone_id;
      const isIntrusion = draft.zone_type === "intrusion_alarm";
      const isFire = draft.zone_type === "fire_alarm";

      const intrusionSelect = isIntrusion
        ? `<div class="form-row"><label class="field-label">Intrusion Type</label>
            <select id="edit-intrusion-type">${this._optionsHtml(INTRUSION_TYPES, draft.intrusion_type)}</select></div>`
        : "";
      const fireSelect = isFire
        ? `<div class="form-row"><label class="field-label">Fire Type</label>
            <select id="edit-fire-type">${this._optionsHtml(FIRE_TYPES, draft.fire_type)}</select></div>`
        : "";
      const partitionRow =
        isIntrusion || isFire
          ? `<div class="form-row"><label class="field-label">Partition</label>
              <button type="button" class="btn secondary" data-open-zone-partition>${this._esc(this._partitionLabel(draft.partition))}</button></div>`
          : "";
      const activateRow =
        draft.action === "activate"
          ? `<div class="form-row"><label class="field-label">Automation Entity</label>
              <div class="picker-host" id="activate-picker-${zid}"></div></div>`
          : "";
      const pulseRow = draft.action === "pulse" ? this._renderPulseFields("edit", draft) : "";

      return `
        <div class="modal-overlay" id="zone-edit-overlay">
          <div class="modal wide">
            <h2>Edit Zone ${zid}</h2>
            <div class="edit-two-pane">
              <div class="edit-pane-left">
                <div class="form-row"><label class="field-label">Zone Name</label>
                  <input id="edit-zone-name" type="text" maxlength="32" value="${this._esc(draft.zone_name)}" /></div>
                <div class="form-row"><label class="field-label">Zone Type</label>
                  <select id="edit-zone-type">
                    <option value="automation"${draft.zone_type === "automation" ? " selected" : ""}>Automation</option>
                    <option value="intrusion_alarm"${draft.zone_type === "intrusion_alarm" ? " selected" : ""}>Intrusion Alarm</option>
                    <option value="fire_alarm"${draft.zone_type === "fire_alarm" ? " selected" : ""}>Fire Alarm</option>
                  </select></div>
                <div class="form-row"><label class="field-label">Input Entity</label>
                  <div class="picker-host" id="input-picker-${zid}"></div></div>
                ${intrusionSelect}
                ${fireSelect}
                <div class="form-row"><label class="field-label">Debounce/Alarm Delay</label>
                  <input id="edit-debounce" type="number" min="0" max="999999" value="${draft.delay_milliseconds ?? 250}" />
                  <span>ms</span></div>
                <div class="form-row"><label class="field-label">Output Entity</label>
                  <div class="picker-host" id="output-picker-${zid}"></div></div>
                <div class="form-row"><label class="field-label">Action</label>
                  <select id="edit-action">${this._optionsHtml(ACTION_OPTIONS, draft.action || "disabled")}</select></div>
                ${activateRow}
                ${pulseRow}
                ${partitionRow}
                ${this._saveError ? `<div class="save-error">${this._esc(this._saveError)}</div>` : ""}
              </div>
              <div class="edit-pane-right help-pane">${ZONE_EDIT_HELP}</div>
            </div>
            <div class="edit-actions">
              <button type="button" id="zone-save">Save</button>
              <button type="button" id="zone-cancel" class="secondary">Cancel</button>
            </div>
          </div>
        </div>
      `;
    }

    _renderPartitionEditModal() {
      const draft = this._editPartitionDraft;
      const pid = draft.partition_id;
      const accounts = draft.enabled_alarm_accounts || [];
      const accountOptions = [
        `<option value="disabled"${draft.alarm_account === "disabled" ? " selected" : ""}>Disabled</option>`,
        ...accounts.map(
          (a) =>
            `<option value="${a.id}"${String(draft.alarm_account) === String(a.id) ? " selected" : ""}>${this._esc(a.label)}</option>`
        ),
      ].join("");
      const activateRow =
        draft.activation_action === "activate"
          ? `<div class="form-row"><label class="field-label">Automation Entity</label>
              <div class="picker-host" id="partition-activate-picker-${pid}"></div></div>`
          : "";
      const pulseRow =
        draft.activation_action === "pulse" ? this._renderPulseFields("partition", draft) : "";

      return `
        <div class="modal-overlay">
          <div class="modal wide">
            <h2>Edit Partition ${pid}</h2>
            <div class="edit-two-pane">
              <div class="edit-pane-left">
                <div class="form-row"><label class="field-label">Partition Name</label>
                  <input id="edit-partition-name" type="text" maxlength="16" value="${this._esc(draft.partition_name || "")}" /></div>
                <div class="form-row"><label class="field-label">Alarm Account</label>
                  <select id="edit-alarm-account"${accounts.length ? "" : " disabled"}>${accountOptions}</select></div>
                <div class="form-row"><label class="field-label">Activation Action</label>
                  <select id="edit-partition-action">${this._optionsHtml(ACTION_OPTIONS, draft.activation_action || "disabled")}</select></div>
                ${activateRow}
                ${pulseRow}
                ${this._saveError ? `<div class="save-error">${this._esc(this._saveError)}</div>` : ""}
              </div>
              <div class="edit-pane-right help-pane">
                <p><strong>Partition Name:</strong> Up to 16 alphanumeric characters.</p>
                <p><strong>Alarm Account:</strong> Links partition to a configured alarm receiver account.</p>
                <p><strong>Activation Action:</strong> Output behavior when the partition enters alarm.</p>
              </div>
            </div>
            <div class="edit-actions">
              <button type="button" id="partition-save-btn">Save</button>
              <button type="button" id="partition-cancel-btn" class="secondary">Cancel</button>
            </div>
          </div>
        </div>
      `;
    }

    _renderKeypadEditModal() {
      const draft = this._editKeypadDraft;
      const kid = draft.keypad_id;
      return `
        <div class="modal-overlay">
          <div class="modal wide">
            <h2>Edit Keypad ${kid}</h2>
            <div class="edit-two-pane">
              <div class="edit-pane-left">
                <div class="form-row"><label class="field-label">Enabled</label>
                  <select id="edit-keypad-enabled">
                    <option value="disabled"${draft.enabled === "disabled" ? " selected" : ""}>Disabled</option>
                    <option value="enabled"${draft.enabled === "enabled" ? " selected" : ""}>Enabled</option>
                  </select></div>
                <div class="form-row"><label class="field-label">Keypad Type</label>
                  <select id="edit-keypad-type">${this._optionsHtml(KEYPAD_TYPES, draft.keypad_type)}</select></div>
                <div class="form-row"><label class="field-label">Keypad Name</label>
                  <input id="edit-keypad-name" type="text" maxlength="32" value="${this._esc(draft.keypad_name || "")}" /></div>
                <div class="form-row"><label class="field-label">Partitions</label>
                  <button type="button" class="btn secondary" data-open-keypad-partitions>${this._esc(this._partitionIdsLabel(draft.partition_ids))}</button></div>
                ${this._saveError ? `<div class="save-error">${this._esc(this._saveError)}</div>` : ""}
              </div>
              <div class="edit-pane-right help-pane">
                <p><strong>Enabled:</strong> Creates the Lovelace keypad helper when enabled.</p>
                <p><strong>Partitions:</strong> Partitions displayed and controlled by this keypad.</p>
              </div>
            </div>
            <div class="edit-actions">
              <button type="button" id="keypad-save-btn">Save</button>
              <button type="button" id="keypad-cancel-btn" class="secondary">Cancel</button>
            </div>
          </div>
        </div>
      `;
    }

    _renderUserEditModal() {
      const draft = this._editUserDraft;
      const num = draft.user_number;
      return `
        <div class="modal-overlay">
          <div class="modal wide">
            <h2>Edit Alarm User ${num}</h2>
            <div class="edit-two-pane">
              <div class="edit-pane-left">
                <div class="form-row"><label class="field-label">User Level</label>
                  <select id="edit-user-level">${this._optionsHtml(USER_LEVELS, draft.user_level)}</select></div>
                <div class="form-row"><label class="field-label">User Name</label>
                  <input id="edit-user-name" type="text" maxlength="32" value="${this._esc(draft.user_name || "")}" /></div>
                <div class="form-row"><label class="field-label">User Code</label>
                  <input id="edit-user-code" type="password" placeholder="${draft.has_code ? "Leave blank to keep existing" : "Enter new code"}" /></div>
                <div class="form-row"><label class="field-label">Partitions</label>
                  <button type="button" class="btn secondary" data-open-user-partitions>${this._esc(this._partitionIdsLabel(draft.partition_ids))}</button></div>
                ${this._saveError ? `<div class="save-error">${this._esc(this._saveError)}</div>` : ""}
              </div>
              <div class="edit-pane-right help-pane">
                <p><strong>User Level:</strong> Disabled, User, Manager, or Installer access.</p>
                <p><strong>Partitions:</strong> Partitions this user may arm/disarm.</p>
                <p><strong>User Code:</strong> PIN used at keypads. Leave blank to keep the current code.</p>
              </div>
            </div>
            <div class="edit-actions">
              <button type="button" id="user-save-btn">Save</button>
              <button type="button" id="user-cancel-btn" class="secondary">Cancel</button>
            </div>
          </div>
        </div>
      `;
    }

    _mountEntityPickers() {
      if (!this._hass) return;

      if (this._editingZone && this._editDraft) {
        const zid = this._editDraft.zone_id;
        this._mountPicker(`input-picker-${zid}`, this._editDraft.input_entity_id, INPUT_DOMAINS, (val) => {
          this._editDraft.input_entity_id = val || null;
        });
        this._mountPicker(`output-picker-${zid}`, this._editDraft.output_entity_id, OUTPUT_DOMAINS, (val) => {
          this._editDraft.output_entity_id = val || null;
        });
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

      if (this._editingPartition && this._editPartitionDraft) {
        const pid = this._editPartitionDraft.partition_id;
        if (this._editPartitionDraft.activation_action === "activate") {
          this._mountPicker(
            `partition-activate-picker-${pid}`,
            this._editPartitionDraft.activate_entity_id,
            ACTIVATE_DOMAINS,
            (val) => {
              this._editPartitionDraft.activate_entity_id = val || null;
            }
          );
        }
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
      picker.addEventListener("value-changed", (ev) => onChange(ev.detail.value));
      host.appendChild(picker);
    }

    _collectPulseFields(prefix, target) {
      const h = this.shadowRoot.querySelector(`#${prefix}-pulse-hours`);
      const m = this.shadowRoot.querySelector(`#${prefix}-pulse-minutes`);
      const s = this.shadowRoot.querySelector(`#${prefix}-pulse-seconds`);
      if (h) target.pulse_hours = parseInt(h.value, 10) || 0;
      if (m) target.pulse_minutes = parseInt(m.value, 10) || 0;
      if (s) target.pulse_seconds = parseInt(s.value, 10) || 0;
    }

    _stripUiFields(obj) {
      const copy = { ...obj };
      [
        "partition_editable",
        "intrusion_type_editable",
        "fire_type_editable",
        "output_action_editable",
        "output_action_display",
        "alarm_account_editable",
        "enabled_alarm_accounts",
        "alarm_account_label",
      ].forEach((k) => delete copy[k]);
      return copy;
    }

    async _saveZone() {
      if (!this._editDraft) return;
      this._saveError = null;
      const draft = { ...this._editDraft };
      const nameEl = this.shadowRoot.querySelector("#edit-zone-name");
      const typeEl = this.shadowRoot.querySelector("#edit-zone-type");
      const debEl = this.shadowRoot.querySelector("#edit-debounce");
      const actionEl = this.shadowRoot.querySelector("#edit-action");
      const intrusionEl = this.shadowRoot.querySelector("#edit-intrusion-type");
      const fireEl = this.shadowRoot.querySelector("#edit-fire-type");

      if (nameEl) draft.zone_name = nameEl.value.trim();
      if (typeEl) draft.zone_type = typeEl.value;
      if (debEl) draft.delay_milliseconds = parseInt(debEl.value, 10) || 0;
      if (actionEl) draft.action = actionEl.value;
      if (intrusionEl) draft.intrusion_type = intrusionEl.value;
      if (fireEl) draft.fire_type = fireEl.value;
      if (draft.zone_type === "automation") draft.partition = "disabled";
      this._collectPulseFields("edit", draft);

      try {
        await this._call("alarm_zone_manager/update_zone", { zone: this._stripUiFields(draft) });
        this._cancelAllEdits();
        await this._loadAll();
      } catch (err) {
        this._saveError = err?.message || String(err);
        this._editDraft = draft;
        this._render();
      }
    }

    async _savePartition() {
      if (!this._editPartitionDraft) return;
      this._saveError = null;
      const draft = { ...this._editPartitionDraft };
      const nameEl = this.shadowRoot.querySelector("#edit-partition-name");
      const acctEl = this.shadowRoot.querySelector("#edit-alarm-account");
      const actionEl = this.shadowRoot.querySelector("#edit-partition-action");
      if (nameEl) draft.partition_name = nameEl.value.trim();
      if (acctEl) draft.alarm_account = acctEl.value;
      if (actionEl) draft.activation_action = actionEl.value;
      this._collectPulseFields("partition", draft);

      try {
        await this._call("alarm_zone_manager/update_partition", {
          partition: this._stripUiFields(draft),
        });
        this._cancelAllEdits();
        await this._loadAll();
      } catch (err) {
        this._saveError = err?.message || String(err);
        this._editPartitionDraft = draft;
        this._render();
      }
    }

    async _saveKeypad() {
      if (!this._editKeypadDraft) return;
      this._saveError = null;
      const draft = { ...this._editKeypadDraft };
      const enabledEl = this.shadowRoot.querySelector("#edit-keypad-enabled");
      const typeEl = this.shadowRoot.querySelector("#edit-keypad-type");
      const nameEl = this.shadowRoot.querySelector("#edit-keypad-name");
      if (enabledEl) draft.enabled = enabledEl.value;
      if (typeEl) draft.keypad_type = typeEl.value;
      if (nameEl) draft.keypad_name = nameEl.value.trim();

      try {
        await this._call("alarm_zone_manager/update_keypad", { keypad: draft });
        this._cancelAllEdits();
        await this._loadAll();
      } catch (err) {
        this._saveError = err?.message || String(err);
        this._editKeypadDraft = draft;
        this._render();
      }
    }

    async _saveUser() {
      if (!this._editUserDraft) return;
      this._saveError = null;
      const draft = { ...this._editUserDraft };
      const levelEl = this.shadowRoot.querySelector("#edit-user-level");
      const nameEl = this.shadowRoot.querySelector("#edit-user-name");
      const codeEl = this.shadowRoot.querySelector("#edit-user-code");
      if (levelEl) draft.user_level = levelEl.value;
      if (nameEl) draft.user_name = nameEl.value.trim();
      const payload = { user: this._stripUiFields(draft) };
      const code = codeEl?.value?.trim();
      if (code) payload.user_code = code;

      try {
        await this._call("alarm_zone_manager/update_alarm_user", payload);
        this._cancelAllEdits();
        await this._loadAll();
      } catch (err) {
        this._saveError = err?.message || String(err);
        this._editUserDraft = draft;
        this._render();
      }
    }

    _renderZones() {
      const testCol = this._zoneTestEnabled ? `<th>Test</th>` : "";
      const rows = this._zonePageSlice()
        .map((z) => {
          const testCell = this._zoneTestEnabled
            ? `<td><button type="button" data-test-zone="${z.zone_id}">Activate</button>
                <input type="number" id="dur-${z.zone_id}" value="5" min="0.1" max="300" step="0.1" style="width:60px"/></td>`
            : "";
          const action = z.output_action_display || z.action || "";
          const actionText =
            action === "pulse"
              ? `${actionLabel(action)} (${this._formatPulseDuration(z)})`
              : actionLabel(action);
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
            <td>${this._esc(actionText)}</td>
            <td class="${z.partition_editable ? "" : "grayed"}">${this._esc(z.partition)}</td>
            <td><button type="button" data-edit-zone="${z.zone_id}">Edit</button></td>
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
        <div class="pagination"><span>Pages:</span> ${pageButtons}</div>
      `;
    }

    _renderPartitions() {
      const rows = this._partitions
        .map(
          (p) => `<tr>
            <td>${p.partition_id}</td>
            <td>${this._esc(p.partition_name || "")}</td>
            <td class="${p.alarm_account_editable ? "" : "grayed"}">${this._esc(p.alarm_account)}</td>
            <td>${this._esc(actionLabel(p.activation_action))}</td>
            <td><button type="button" data-edit-partition="${p.partition_id}">Edit</button></td>
          </tr>`
        )
        .join("");
      return `<div class="grid-wrap"><table><thead><tr>
        <th>Partition</th><th>Name</th><th>Alarm Account</th><th>Activation Action</th><th></th>
      </tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    _renderKeypads() {
      const rows = this._keypads
        .map(
          (k) => `<tr>
            <td>${k.keypad_id}</td>
            <td>${k.enabled}</td>
            <td>${this._esc(this._partitionIdsLabel(k.partition_ids))}</td>
            <td>${this._esc(k.keypad_type)}</td>
            <td>${this._esc(k.keypad_name)}</td>
            <td><button type="button" data-edit-keypad="${k.keypad_id}">Edit</button></td>
          </tr>`
        )
        .join("");
      return `<div class="grid-wrap"><table><thead><tr>
        <th>ID</th><th>Enable</th><th>Partitions</th><th>Type</th><th>Name</th><th></th>
      </tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    _renderUsers() {
      const rows = this._users
        .map(
          (u) => `<tr>
            <td>${u.user_number}</td>
            <td>${u.user_level}</td>
            <td>${this._esc(this._partitionIdsLabel(u.partition_ids))}</td>
            <td>${this._esc(u.user_name || "")}</td>
            <td>${u.has_code ? "****" : ""}</td>
            <td><button type="button" data-edit-user="${u.user_number}">Edit</button></td>
          </tr>`
        )
        .join("");
      return `<div class="grid-wrap"><table><thead><tr>
        <th>#</th><th>Level</th><th>Partitions</th><th>Name</th><th>Code</th><th></th>
      </tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    _renderOptions() {
      const o = this._options;
      return `<div>
        <h3>Alarm User Settings</h3>
        <div class="form-row"><label class="field-label">Code Type</label>
          <select id="code-type"><option value="numeric">Numeric</option><option value="alphanumeric">Alphanumeric</option></select></div>
        <div class="form-row"><label class="field-label">Code Length</label>
          <input id="code-len" type="number" min="4" max="16" value="${o.alarm_user_code_length || 4}"/></div>
        <h3>Zone Options</h3>
        <div class="form-row"><label class="field-label">Default Debounce (ms)</label>
          <input id="deb-ms" type="number" value="${o.default_delay_milliseconds || 250}"/></div>
        <div class="form-row"><label class="field-label">Entry Delay 1 (s)</label>
          <input id="ed1" type="number" min="10" max="300" value="${o.intrusion_entry_delay_1_seconds || 30}"/></div>
        <div class="form-row"><label class="field-label">Entry Delay 2 (s)</label>
          <input id="ed2" type="number" min="10" max="300" value="${o.intrusion_entry_delay_2_seconds || 60}"/></div>
        <h3>Developer Options</h3>
        <div class="form-row"><label class="field-label">Developer Options</label>
          <select id="dev-opt"><option value="false">Disabled</option><option value="true">Enabled</option></select></div>
        <div class="form-row"><label class="field-label">Zone Test Tool</label>
          <select id="zone-test"><option value="disabled">Disabled</option><option value="enabled">Enabled</option></select></div>
        <button type="button" id="save-options">Save Options</button>
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
        <button type="button" id="reset-log">Reset Log</button>
        <button type="button" id="export-log">Export Log</button>
      </div>
      <div class="grid-wrap"><table><thead><tr>
        <th>ID</th><th>Date</th><th>Time</th><th>Event Type</th><th>Zone #</th><th>Zone Name</th>
      </tr></thead><tbody>${rows}</tbody></table></div>`;
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
