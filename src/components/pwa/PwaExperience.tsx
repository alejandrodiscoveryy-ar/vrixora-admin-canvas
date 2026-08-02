import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, RefreshCw, Share2, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PWA_APP_NAME, isIosDevice, isStandaloneDisplayMode } from "@/lib/pwa";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaExperience() {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  const [canInstall, setCanInstall] = useState(false);
  const [isStandalone, setIsStandalone] = useState(isStandaloneDisplayMode());
  const [iosHelpVisible, setIosHelpVisible] = useState(isIosDevice());
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const installPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const refreshRequestedRef = useRef(false);

  useEffect(() => {
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);
    const handleDisplayModeChange = () => setIsStandalone(isStandaloneDisplayMode());
    const handleAppInstalled = () => {
      installPromptRef.current = null;
      setCanInstall(false);
      setIosHelpVisible(false);
      setIsStandalone(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("appinstalled", handleAppInstalled);
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    standaloneQuery.addEventListener("change", handleDisplayModeChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("appinstalled", handleAppInstalled);
      standaloneQuery.removeEventListener("change", handleDisplayModeChange);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;

    const register = async () => {
      registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });

      if (registration.waiting && navigator.serviceWorker.controller) {
        setUpdateAvailable(true);
      }

      registration.addEventListener("updatefound", () => {
        const installingWorker = registration?.installing;
        if (!installingWorker) return;

        installingWorker.addEventListener("statechange", () => {
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
          }
        });
      });
    };

    void register().catch((error) => {
      console.error("Service worker registration failed:", error);
    });

    const controllerChange = () => {
      if (refreshRequestedRef.current) {
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener("controllerchange", controllerChange);

    const updateInterval = window.setInterval(() => {
      void registration?.update().catch(() => undefined);
    }, 60 * 60 * 1000);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", controllerChange);
      window.clearInterval(updateInterval);
    };
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      installPromptRef.current = event as BeforeInstallPromptEvent;
      setCanInstall(true);
      setIosHelpVisible(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const installVisible = canInstall && !isStandalone;
  const showIosHelp = iosHelpVisible && !isStandalone && !installVisible;

  const handleInstall = async () => {
    const prompt = installPromptRef.current;
    if (!prompt) return;

    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") {
      installPromptRef.current = null;
      setCanInstall(false);
      setIsStandalone(true);
    }
  };

  const handleUpdate = () => {
    refreshRequestedRef.current = true;
    setUpdateAvailable(false);
    navigator.serviceWorker.controller?.postMessage({ type: "SKIP_WAITING" });
  };

  const panels = useMemo(() => {
    const items: Array<{ key: string; node: ReactNode }> = [];

    if (offline) {
      items.push({
        key: "offline",
        node: (
          <Card className="glass-panel border-destructive/20 bg-destructive/5">
            <CardContent className="flex items-start gap-3 p-4 sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-full bg-destructive/15 p-2 text-destructive">
                  <WifiOff className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-medium text-foreground">Sin conexión</p>
                  <p className="text-sm text-muted-foreground">
                    Comprueba Internet para continuar utilizando el Centro de Control de VRIXORA.
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground sm:max-w-xs sm:text-right">
                Las acciones administrativas quedan deshabilitadas hasta que vuelva la conexión.
              </p>
            </CardContent>
          </Card>
        ),
      });
      return items;
    }

    if (updateAvailable) {
      items.push({
        key: "update",
        node: (
          <Card className="glass-panel border-primary/20 bg-primary/5">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-full bg-primary/15 p-2 text-primary">
                  <RefreshCw className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-medium text-foreground">Hay una nueva versión disponible.</p>
                  <p className="text-sm text-muted-foreground">
                    Actualiza para obtener la versión más reciente del Centro de Control.
                  </p>
                </div>
              </div>
              <Button onClick={handleUpdate} className="shrink-0">
                Actualizar ahora
              </Button>
            </CardContent>
          </Card>
        ),
      });
    }

    if (installVisible) {
      items.push({
        key: "install",
        node: (
          <Card className="glass-panel border-primary/20 bg-background/75">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-full bg-primary/15 p-2 text-primary">
                  <Download className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-medium text-foreground">Instala {PWA_APP_NAME}</p>
                  <p className="text-sm text-muted-foreground">
                    Ábrela en modo standalone desde Android, Windows o tablet.
                  </p>
                </div>
              </div>
              <Button onClick={handleInstall} className="shrink-0">
                Instalar aplicación
              </Button>
            </CardContent>
          </Card>
        ),
      });
    }

    if (showIosHelp) {
      items.push({
        key: "ios-help",
        node: (
          <Card className="glass-panel border-primary/20 bg-background/75">
            <CardContent className="flex items-start gap-3 p-4">
              <span className="mt-0.5 rounded-full bg-primary/15 p-2 text-primary">
                <Share2 className="h-4 w-4" />
              </span>
              <div>
                <p className="font-medium text-foreground">Instalación en iPhone</p>
                <p className="text-sm text-muted-foreground">
                  Pulsa Compartir y selecciona Añadir a pantalla de inicio.
                </p>
              </div>
            </CardContent>
          </Card>
        ),
      });
    }

    return items;
  }, [handleUpdate, installVisible, iosHelpVisible, offline, showIosHelp, updateAvailable]);

  if (panels.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-[1600px] px-3 pt-3 sm:px-6">
      <div className="space-y-3">
        {panels.map((panel) => (
          <div key={panel.key}>{panel.node}</div>
        ))}
      </div>
    </div>
  );
}