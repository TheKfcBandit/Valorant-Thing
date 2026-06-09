import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { noAnim, T0 } from "../../utils/animation";
import { Label } from "../ui/Label";
import { Toggle } from "../ui/Toggle";
import { ChevronDown, HelpCircle } from "../../icons";
import { DodgeKeybindSetting } from "./DodgeKeybindSetting";

export function NotificationSettings({
  notificationsEnabled,
  onNotificationsEnabledChange,
  notificationPosition,
  onNotificationPositionChange,
  notificationScreen,
  onNotificationScreenChange,
  spikeTimerEnabled,
  onSpikeTimerEnabledChange,
}) {
  const [monitors, setMonitors] = useState([]);

  useEffect(() => {
    if (!notificationsEnabled || !notificationScreen?.startsWith("monitor:")) return;
    invoke("list_monitors")
      .then((raw) => {
        const list = JSON.parse(raw);
        setMonitors(
          list.map((m, i) => ({
            index: i,
            width: m.width,
            height: m.height,
            hz: m.hz,
            primary: m.primary,
            label: `Display ${i + 1}  ${m.width}x${m.height}${m.hz ? `@${m.hz}hz` : ""}${m.primary ? "  [PRIMARY]" : ""}`,
          }))
        );
      })
      .catch((e) => console.error("[monitors]", e));
  }, [notificationsEnabled, notificationScreen]);

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
      transition={noAnim() ? T0 : { duration: 0.2 }}
      className="rounded-xl bg-base-700 border border-border divide-y divide-border"
    >
      <div className="px-4 pt-3 pb-1">
        <Label as="h2">Notifications</Label>
      </div>
      <div className="flex items-center justify-between p-4">
        <div>
          <p className="text-sm font-display font-medium text-text-primary">Enabled</p>
          <p className="text-xs font-body text-text-muted mt-0.5">
            Show in-game notification toasts
          </p>
        </div>
        <Toggle enabled={notificationsEnabled} onChange={onNotificationsEnabledChange} />
      </div>
      {notificationsEnabled && (
        <div className="p-4 space-y-3">
          <div className="space-y-2">
            <p className="text-xs font-body text-text-muted">Display on</p>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                {
                  value: "game",
                  label: "Game Screen",
                  tip: "Notifications appear on whichever monitor Valorant is running on",
                },
                {
                  value: "app",
                  label: "App Screen",
                  tip: "Notifications appear on whichever monitor this app is on",
                },
                { value: "custom", label: "Custom", tip: "Pick a specific monitor" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() =>
                    onNotificationScreenChange(
                      opt.value === "custom"
                        ? `monitor:${notificationScreen.startsWith("monitor:") ? notificationScreen.split(":")[1] : "0"}`
                        : opt.value
                    )
                  }
                  className={`group relative flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-body transition-colors ${
                    (
                      opt.value === "custom"
                        ? notificationScreen.startsWith("monitor:")
                        : notificationScreen === opt.value
                    )
                      ? "bg-val-red/20 border border-val-red/40 text-val-red font-semibold"
                      : "bg-base-600 border border-border text-text-secondary hover:text-text-primary hover:bg-base-500"
                  }`}
                >
                  {opt.label}
                  <HelpCircle className="shrink-0 opacity-40 group-hover:opacity-70 transition-opacity" />
                  <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg bg-base-800 border border-border text-[10px] text-text-secondary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                    {opt.tip}
                  </div>
                </button>
              ))}
            </div>
            {notificationScreen.startsWith("monitor:") && monitors.length > 0 && (
              <div className="relative pt-1">
                <select
                  value={notificationScreen}
                  onChange={(e) => onNotificationScreenChange(e.target.value)}
                  className="w-full appearance-none bg-base-600 border border-border rounded-lg px-3 py-2 text-xs font-body text-text-primary focus:outline-none focus:border-val-red/50 cursor-pointer"
                >
                  {monitors.map((m) => (
                    <option key={m.index} value={`monitor:${m.index}`}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={12}
                  className="absolute right-3 top-1/2 translate-y-px pointer-events-none text-text-muted"
                />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-body text-text-muted">Position on screen</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { value: "top-left", label: "Top Left" },
                { value: "top-right", label: "Top Right" },
                { value: "bottom-left", label: "Bottom Left" },
                { value: "bottom-right", label: "Bottom Right" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onNotificationPositionChange(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-body transition-colors ${
                    notificationPosition === opt.value
                      ? "bg-val-red/20 border border-val-red/40 text-val-red font-semibold"
                      : "bg-base-600 border border-border text-text-secondary hover:text-text-primary hover:bg-base-500"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-sm font-display font-medium text-text-primary">Spike Timer</p>
              <p className="text-xs font-body text-text-muted mt-0.5">
                Show a 45s countdown when the spike is planted
              </p>
            </div>
            <Toggle enabled={spikeTimerEnabled} onChange={onSpikeTimerEnabledChange} />
          </div>
          <DodgeKeybindSetting />
        </div>
      )}
    </motion.div>
  );
}
