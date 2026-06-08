import HomePage from "../HomePage";
import InstalockPage from "../InstalockPage";
import LivePage from "../LivePage";
import PremierPage from "../PremierPage";
import LineupsPage from "../LineupsPage";
import HeatmapPage from "../HeatmapPage";
import CrosshairPage from "../CrosshairPage";
import MapDodgePage from "../MapDodgePage";
import LoadoutPage from "../LoadoutPage";
import StorePage from "../StorePage";
import WrappedPage from "../WrappedPage";
import CoachPage from "../CoachPage";
import ChatPage from "../ChatPage";
import MiscPage from "../MiscPage";
import LogsPage from "../LogsPage";
import DevPage from "../DevPage";
import SettingsConnector from "./SettingsConnector";

// Build the tab → page element map consumed by PageRouter. Lifting
// this out of App.jsx keeps the shell under the file-size budget; the
// prop wiring is what it is — every page hits a different slice of
// global state.
//
// Only the active tab gets a constructed element; the rest are `null`.
// PageRouter unwraps via `pages[activeTab]`, so unmounted pages cost
// nothing per render. (fakestatus is rendered separately via PageRouter's
// `alwaysMounted` slot — App.jsx handles it directly.)
export function buildPages(props) {
  const { activeTab } = props;
  const connected = props.status === "connected";
  const make = (tab, build) => (activeTab === tab ? build() : null);
  return {
    home: make("home", () => (
      <HomePage
        connected={connected}
        player={props.player}
        playerIsStale={props.playerIsStale}
        refreshKey={props.refreshKey}
        onRefresh={props.confirmRefresh}
      />
    )),
    instalock: make("instalock", () => (
      <InstalockPage
        onActiveChange={props.setInstalockActive}
        onConfigChange={(cfg) => {
          props.refs.instalockConfig.current = cfg;
        }}
        connected={connected}
      />
    )),
    live: make("live", () => (
      <LivePage
        splooshimaApiKey={props.splooshimaApiKey}
        splooshimaAvailable={props.splooshimaAvailable}
        player={props.player}
        connected={connected}
        addLog={props.addLog}
        onRefresh={props.confirmRefresh}
      />
    )),
    premier: make("premier", () => (
      <PremierPage
        connected={connected}
        player={props.player}
        playerIsStale={props.playerIsStale}
      />
    )),
    lineups: make("lineups", () => <LineupsPage />),
    heatmap: make("heatmap", () => <HeatmapPage player={props.player} />),
    mapdodge: make("mapdodge", () => (
      <MapDodgePage
        onActiveChange={props.setMapDodgeActive}
        onBlacklistChange={(cfg) => {
          props.refs.mapDodge.current = cfg;
        }}
        connected={connected}
      />
    )),
    settings: make("settings", () => <SettingsConnector {...props.settings} />),
    loadout: make("loadout", () => <LoadoutPage connected={connected} />),
    crosshair: make("crosshair", () => <CrosshairPage />),
    store: make("store", () => <StorePage connected={connected} />),
    wrapped: make("wrapped", () => <WrappedPage />),
    coach: make("coach", () => <CoachPage />),
    chat: make("chat", () => <ChatPage connected={connected} addLog={props.addLog} />),
    misc: make("misc", () => (
      <MiscPage
        connected={connected}
        autoUnqueue={props.autoUnqueue}
        onAutoUnqueueChange={props.setAutoUnqueue}
        autoRequeue={props.autoRequeue}
        onAutoRequeueChange={props.setAutoRequeue}
      />
    )),
    logs:
      props.showLogs && activeTab === "logs" ? (
        <LogsPage logs={props.logs} onClear={() => props.setLogs([])} />
      ) : null,
    dev:
      props.devTab && activeTab === "dev" ? (
        <DevPage
          logs={props.logs}
          pushNotification={props.pushNotification}
          addLog={props.addLog}
          onClearLogs={() => props.setLogs([])}
        />
      ) : null,
  };
}
