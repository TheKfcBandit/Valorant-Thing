import { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { exportVtFile, readVtFile } from "../cloud";
import { getAgents, getMaps } from "../valApiSkins";
import { EXCLUDED_MAPS } from "../utils/maps";
import { NONE_AGENT, ROLE_ORDER } from "../utils/agents";
import {
  ACTIVE_PROFILE_KEY,
  FREE_AGENTS,
  getAllowedAgentsForMap,
  getSkirmishAbilityName,
  isAgentAllowedForMap,
  isSkirmishMap,
  loadConfig,
  loadProfiles,
  resolveAgent,
  restorePerMap,
  saveConfig,
  saveProfilesLS,
  slimAgent,
} from "../utils/instalockConfig";
import AllMapsView from "./instalock/AllMapsView";
import PerMapView from "./instalock/PerMapView";
import InstalockToolbar from "./instalock/InstalockToolbar";
import { DeleteProfileModal, ProfileNameModal, ShareProfileModal } from "./instalock/ProfileModals";

export default function InstalockPage({ onActiveChange, onConfigChange, connected }) {
  const [subTab, setSubTab] = useState("all");
  const [agents, setAgents] = useState([]);
  const [maps, setMaps] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedMap, setSelectedMap] = useState(null);
  const [perMapSelections, setPerMapSelections] = useState({});
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ownedAgents, setOwnedAgents] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [dotMenuId, setDotMenuId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [importMode, setImportMode] = useState(false);
  const [importValue, setImportValue] = useState("");
  const [importError, setImportError] = useState("");
  const [nameModal, setNameModal] = useState(null);
  const [nameModalValue, setNameModalValue] = useState("");
  const [shareResult, setShareResult] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [roleFilter, setRoleFilter] = useState("all");
  const profileMenuRef = useRef(null);
  const vtFileRef = useRef(null);
  const configLoaded = useRef(false);

  useEffect(() => {
    invoke("get_owned_agents")
      .then((ids) => setOwnedAgents(new Set(ids)))
      .catch(() => setOwnedAgents(null));
  }, []);

  useEffect(() => {
    Promise.all([getAgents(), getMaps()])
      .then(([allAgents, allMaps]) => {
        const sorted = [...allAgents].sort((a, b) => a.displayName.localeCompare(b.displayName));
        setAgents(sorted);
        const playable = allMaps.filter((m) => !EXCLUDED_MAPS.includes(m.displayName));
        setMaps(playable);

        let profs = loadProfiles();
        let activeId = localStorage.getItem(ACTIVE_PROFILE_KEY);

        if (!profs.length) {
          const cfg = loadConfig();
          profs = [
            {
              id: "default",
              name: "Default",
              defaultAgent: cfg?.defaultAgent || null,
              perMap: cfg?.perMap || {},
            },
          ];
          activeId = "default";
          saveProfilesLS(profs);
          localStorage.setItem(ACTIVE_PROFILE_KEY, activeId);
        }
        if (!activeId || !profs.find((p) => p.id === activeId)) {
          activeId = profs[0].id;
          localStorage.setItem(ACTIVE_PROFILE_KEY, activeId);
        }

        setProfiles(profs);
        setActiveProfileId(activeId);

        const profile = profs.find((p) => p.id === activeId);
        const cfg = loadConfig();
        const source = profile || cfg;
        if (source) {
          if (source.defaultAgent) setSelectedAgent(resolveAgent(sorted, source.defaultAgent));
          setPerMapSelections(restorePerMap(sorted, source.perMap));
          if (cfg?.active) {
            setActive(true);
            onActiveChange?.(true);
          }
          configLoaded.current = true;
        }
      })
      .catch((e) => console.error("[instalock] fetch failed:", e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading || !activeProfileId) return;
    saveConfig(selectedAgent, perMapSelections, active);
    const perMap = {};
    for (const [mapId, agent] of Object.entries(perMapSelections)) perMap[mapId] = slimAgent(agent);
    setProfiles((prev) => {
      const updated = prev.map((p) =>
        p.id === activeProfileId ? { ...p, defaultAgent: slimAgent(selectedAgent), perMap } : p
      );
      saveProfilesLS(updated);
      return updated;
    });
  }, [selectedAgent, perMapSelections, active, loading, activeProfileId]);

  // `onConfigChange` deliberately omitted from deps — App.jsx hands a
  // fresh arrow each render via buildPages, so including it would fire
  // this effect every parent render and churn `refs.instalockConfig.current`.
  useEffect(() => {
    if (!loading) onConfigChange?.({ maps, selectedAgent, perMapSelections });
  }, [maps, selectedAgent, perMapSelections, loading]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handler = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setProfileMenuOpen(false);
        setDotMenuId(null);
        setImportMode(false);
        setImportValue("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileMenuOpen]);

  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  const switchProfile = (newId) => {
    if (newId === activeProfileId) {
      setProfileMenuOpen(false);
      return;
    }
    const perMap = {};
    for (const [mapId, agent] of Object.entries(perMapSelections)) perMap[mapId] = slimAgent(agent);
    const saved = profiles.map((p) =>
      p.id === activeProfileId ? { ...p, defaultAgent: slimAgent(selectedAgent), perMap } : p
    );
    const target = saved.find((p) => p.id === newId);
    if (!target) return;
    setSelectedAgent(resolveAgent(agents, target.defaultAgent));
    setPerMapSelections(restorePerMap(agents, target.perMap));
    setActiveProfileId(newId);
    localStorage.setItem(ACTIVE_PROFILE_KEY, newId);
    setProfiles(saved);
    saveProfilesLS(saved);
    setProfileMenuOpen(false);
  };

  const startCreateProfile = () => {
    setProfileMenuOpen(false);
    setNameModal({ type: "new" });
    setNameModalValue(`Profile ${profiles.length + 1}`);
  };

  const deleteProfileById = (id) => {
    if (profiles.length <= 1) return;
    const remaining = profiles.filter((p) => p.id !== id);
    if (id === activeProfileId) {
      const target = remaining[0];
      setSelectedAgent(resolveAgent(agents, target.defaultAgent));
      setPerMapSelections(restorePerMap(agents, target.perMap));
      setActiveProfileId(target.id);
      localStorage.setItem(ACTIVE_PROFILE_KEY, target.id);
    }
    setProfiles(remaining);
    saveProfilesLS(remaining);
    setConfirmDeleteId(null);
    setDotMenuId(null);
    setProfileMenuOpen(false);
  };

  const shareProfile = async (id) => {
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return;
    setDotMenuId(null);
    setProfileMenuOpen(false);
    setShareLoading(true);
    setShareResult(null);
    try {
      const code = await invoke("cloud_save", {
        saveType: "agent",
        data: { name: profile.name, defaultAgent: profile.defaultAgent, perMap: profile.perMap },
      });
      navigator.clipboard.writeText(code);
      setShareResult({ code, copied: true });
    } catch (e) {
      setShareResult({ error: e.message });
    } finally {
      setShareLoading(false);
    }
  };

  const exportProfileFile = (id) => {
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return;
    exportVtFile(
      "agent",
      { name: profile.name, defaultAgent: profile.defaultAgent, perMap: profile.perMap },
      `${profile.name}.vt`
    );
    setDotMenuId(null);
    setProfileMenuOpen(false);
  };

  const startImport = async () => {
    const val = importValue.trim();
    if (!val) return;
    setImportError("");
    if (val.toUpperCase().startsWith("VT-AGENT-")) {
      try {
        const result = await invoke("cloud_load", { code: val });
        if (result.type !== "agent") {
          setImportError("Not a profile code");
          return;
        }
        setImportMode(false);
        setImportValue("");
        setProfileMenuOpen(false);
        setNameModal({ type: "import", importData: result.data });
        setNameModalValue(result.data.name || `Imported ${profiles.length + 1}`);
      } catch (e) {
        setImportError(e.message);
      }
    } else {
      try {
        const data = JSON.parse(atob(val));
        setImportMode(false);
        setImportValue("");
        setProfileMenuOpen(false);
        setNameModal({ type: "import", importData: data });
        setNameModalValue(data.name || `Imported ${profiles.length + 1}`);
      } catch {
        setImportError("Invalid code or legacy data");
      }
    }
  };

  const importProfileFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const vt = await readVtFile(file);
      if (vt.type !== "agent") {
        setImportError("Not a profile file");
        return;
      }
      setImportMode(false);
      setImportValue("");
      setProfileMenuOpen(false);
      setNameModal({ type: "import", importData: vt.data });
      setNameModalValue(vt.data.name || `Imported ${profiles.length + 1}`);
    } catch {
      setImportError("Invalid .vt file");
    }
    e.target.value = "";
  };

  const startRename = (id) => {
    const p = profiles.find((pr) => pr.id === id);
    setDotMenuId(null);
    setProfileMenuOpen(false);
    setNameModal({ type: "rename", profileId: id });
    setNameModalValue(p?.name || "");
  };

  const handleNameModalConfirm = () => {
    const name = nameModalValue.trim();
    if (!name || !nameModal) return;
    const stashCurrent = () => {
      const perMap = {};
      for (const [mapId, agent] of Object.entries(perMapSelections))
        perMap[mapId] = slimAgent(agent);
      return profiles.map((p) =>
        p.id === activeProfileId ? { ...p, defaultAgent: slimAgent(selectedAgent), perMap } : p
      );
    };
    if (nameModal.type === "new") {
      const id = Date.now().toString(36);
      const updated = [...stashCurrent(), { id, name, defaultAgent: null, perMap: {} }];
      setSelectedAgent(null);
      setPerMapSelections({});
      setActiveProfileId(id);
      localStorage.setItem(ACTIVE_PROFILE_KEY, id);
      setProfiles(updated);
      saveProfilesLS(updated);
    } else if (nameModal.type === "import") {
      const id = Date.now().toString(36);
      const d = nameModal.importData;
      const np = { id, name, defaultAgent: d?.defaultAgent || null, perMap: d?.perMap || {} };
      const updated = [...stashCurrent(), np];
      setSelectedAgent(resolveAgent(agents, np.defaultAgent));
      setPerMapSelections(restorePerMap(agents, np.perMap));
      setActiveProfileId(id);
      localStorage.setItem(ACTIVE_PROFILE_KEY, id);
      setProfiles(updated);
      saveProfilesLS(updated);
    } else if (nameModal.type === "rename") {
      const updated = profiles.map((p) => (p.id === nameModal.profileId ? { ...p, name } : p));
      setProfiles(updated);
      saveProfilesLS(updated);
    }
    setNameModal(null);
    setNameModalValue("");
  };

  const isOwned = (agent) =>
    !ownedAgents ||
    ownedAgents.has(agent.uuid.toLowerCase()) ||
    FREE_AGENTS.has(agent.displayName.toLowerCase());

  const filteredAgents = useMemo(() => {
    let list = agents;
    if (roleFilter !== "all") list = list.filter((a) => a.role?.displayName === roleFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a) => a.displayName.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const aOwned = isOwned(a) ? 0 : 1;
      const bOwned = isOwned(b) ? 0 : 1;
      if (aOwned !== bOwned) return aOwned - bOwned;
      const aRole = ROLE_ORDER[a.role?.displayName] ?? 99;
      const bRole = ROLE_ORDER[b.role?.displayName] ?? 99;
      if (aRole !== bRole) return aRole - bRole;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [agents, search, ownedAgents, roleFilter]);

  const selectedMapAllowedAgents = useMemo(
    () => getAllowedAgentsForMap(filteredAgents, selectedMap),
    [filteredAgents, selectedMap]
  );

  const handleAgentClick = (agent) => {
    if (!isOwned(agent)) return;
    if (subTab === "all") {
      setSelectedAgent(selectedAgent?.uuid === agent.uuid ? null : agent);
    } else if (selectedMap) {
      if (isSkirmishMap(selectedMap) && !getSkirmishAbilityName(agent)) return;
      setPerMapSelections((prev) => {
        const current = prev[selectedMap.uuid];
        if (current?.uuid === agent.uuid) {
          const next = { ...prev };
          delete next[selectedMap.uuid];
          return next;
        }
        return { ...prev, [selectedMap.uuid]: agent };
      });
    }
  };

  const handleNoneClick = () => {
    if (!selectedMap) return;
    setPerMapSelections((prev) => {
      if (prev[selectedMap.uuid]?.uuid === "none") {
        const next = { ...prev };
        delete next[selectedMap.uuid];
        return next;
      }
      return { ...prev, [selectedMap.uuid]: NONE_AGENT };
    });
  };

  const getAgentForMap = (mapUuid) => perMapSelections[mapUuid] || selectedAgent;
  const getMapAgent = (map) => {
    const selected = perMapSelections[map.uuid] || selectedAgent;
    return isAgentAllowedForMap(selected, map) ? selected : NONE_AGENT;
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
        <div className="flex items-center gap-2 shrink-0 animate-pulse">
          <div className="h-8 w-44 rounded-lg bg-base-700" />
          <div className="flex-1" />
          <div className="h-8 w-44 rounded-lg bg-base-700" />
          <div className="h-5 w-9 rounded-full bg-base-700" />
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="h-3 w-20 rounded bg-base-600 mb-3" />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-1.5 animate-pulse">
            {Array.from({ length: 20 }, (_, i) => (
              <div key={i} className="flex flex-col items-center gap-1 p-1.5">
                <div className="w-14 h-14 rounded-md bg-base-600" />
                <div className="h-2.5 w-10 rounded bg-base-600" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
      <InstalockToolbar
        connected={connected}
        active={active}
        setActive={setActive}
        onActiveChange={onActiveChange}
        subTab={subTab}
        setSubTab={setSubTab}
        setSelectedMap={setSelectedMap}
        search={search}
        setSearch={setSearch}
        selectedMap={selectedMap}
        roleFilter={roleFilter}
        setRoleFilter={setRoleFilter}
        profileManagerProps={{
          profileMenuRef,
          profileMenuOpen,
          onToggleMenu: () => {
            setProfileMenuOpen(!profileMenuOpen);
            setDotMenuId(null);
            setImportMode(false);
            setImportValue("");
          },
          profiles,
          activeProfile,
          activeProfileId,
          dotMenuId,
          setDotMenuId,
          onSwitchProfile: switchProfile,
          onStartRename: startRename,
          onShareProfile: shareProfile,
          onExportProfile: exportProfileFile,
          onRequestDelete: (id) => {
            setConfirmDeleteId(id);
            setDotMenuId(null);
            setProfileMenuOpen(false);
          },
          importMode,
          setImportMode,
          importValue,
          setImportValue,
          importError,
          setImportError,
          startImport,
          vtFileRef,
          importProfileFile,
          onStartCreate: startCreateProfile,
        }}
      />

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {subTab === "all" ? (
          <AllMapsView
            agents={filteredAgents}
            selectedAgent={selectedAgent}
            onAgentClick={handleAgentClick}
            isOwned={isOwned}
            roleFilter={roleFilter}
          />
        ) : (
          <PerMapView
            filteredAgents={filteredAgents}
            selectedMapAgents={selectedMapAllowedAgents}
            maps={maps}
            search={search}
            selectedMap={selectedMap}
            selectedAgent={selectedAgent}
            onMapSelect={(map) => {
              setSelectedMap(map);
              setSearch("");
            }}
            onMapBack={() => {
              setSelectedMap(null);
              setSearch("");
            }}
            perMapSelections={perMapSelections}
            onAgentClick={handleAgentClick}
            onNoneClick={handleNoneClick}
            getAgentForMap={getAgentForMap}
            getMapAgent={getMapAgent}
            isOwned={isOwned}
            roleFilter={roleFilter}
          />
        )}
      </div>

      <ProfileNameModal
        nameModal={nameModal}
        nameModalValue={nameModalValue}
        onChange={setNameModalValue}
        onCancel={() => {
          setNameModal(null);
          setNameModalValue("");
        }}
        onConfirm={handleNameModalConfirm}
      />

      {confirmDeleteId && (
        <DeleteProfileModal
          targetName={profiles.find((p) => p.id === confirmDeleteId)?.name}
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => deleteProfileById(confirmDeleteId)}
        />
      )}

      {(shareResult || shareLoading) && (
        <ShareProfileModal
          shareResult={shareResult}
          shareLoading={shareLoading}
          onCopyCode={() => {
            navigator.clipboard.writeText(shareResult.code);
            setShareResult((r) => ({ ...r, copied: true }));
          }}
          onClose={() => {
            setShareResult(null);
            setShareLoading(false);
          }}
        />
      )}
    </div>
  );
}
