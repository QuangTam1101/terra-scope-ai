import { createContext } from "react";

/** App-level actions that pages can trigger without importing App (avoids circular imports). */
export const AppChrome = createContext<{ replayTutorial: () => void; toLanding: () => void }>({
  replayTutorial: () => {}, toLanding: () => {},
});
