import React, { useState } from "react";
import TabBar, { type Tab } from "./components/layout/TabBar";
import VibeCodeTab from "./pages/VibeCodeTab/VibeCodeTab";
import ReleaseNotesTab from "./pages/ReleaseNotesTab/ReleaseNotesTab";
import AugmentTab from "./pages/AugmentTab/AugmentTab";
import EpicReviewTab from "./pages/EpicReviewTab/EpicReviewTab";
import SettingsTab from "./pages/SettingsTab/SettingsTab";

const TABS: Tab[] = [
  { id: "vibe", label: "Vibe Code" },
  { id: "release", label: "Release Notes" },
  { id: "augment", label: "Augment Epic" },
  { id: "epicReview", label: "Epic Review" },
  { id: "settings", label: "Settings" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("vibe");

  return (
    <div className="app">
      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="tab-content">
        {activeTab === "vibe" && <VibeCodeTab />}
        {activeTab === "release" && <ReleaseNotesTab />}
        {activeTab === "augment" && <AugmentTab />}
        {activeTab === "epicReview" && <EpicReviewTab />}
        {activeTab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}
