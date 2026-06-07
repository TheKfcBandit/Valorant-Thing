import { motion, AnimatePresence } from "framer-motion";

// Switches between page surfaces and handles the cross-fade animation.
//
// App.jsx owns the global state and constructs each page element with
// its own prop wiring; this router just decides which one is mounted.
//
// Props:
//   pages          — { [tabId]: ReactElement } keyed by tab id
//   activeTab      — current active tab id
//   alwaysMounted  — optional { tab, element } for pages that must stay
//                    mounted across tab switches (FakeStatus uses this
//                    so XMPP state doesn't reset on every navigation).
export default function PageRouter({ pages, activeTab, alwaysMounted }) {
  return (
    <>
      <AnimatePresence mode="wait">
        {Object.entries(pages).map(([tab, element]) => {
          if (tab !== activeTab || !element) return null;
          return (
            <motion.div
              key={tab}
              className="flex-1 flex min-h-0"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              {element}
            </motion.div>
          );
        })}
      </AnimatePresence>
      {alwaysMounted && (
        <div
          className={`absolute inset-0 flex min-h-0 ${activeTab === alwaysMounted.tab ? "" : "hidden"}`}
        >
          {alwaysMounted.element}
        </div>
      )}
    </>
  );
}
