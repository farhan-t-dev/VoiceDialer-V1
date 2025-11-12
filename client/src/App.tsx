import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { useCampaignWebSocket } from "@/hooks/use-campaign-websocket";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Analytics from "@/pages/analytics";
import Campaigns from "@/pages/campaigns";
import CampaignDetail from "@/pages/campaign-detail";
import AiAgents from "@/pages/ai-agents";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/contacts" component={Dashboard} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/campaigns" component={Campaigns} />
      <Route path="/campaigns/:id" component={CampaignDetail} />
      <Route path="/agents" component={AiAgents} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginCampaignName, setLoginCampaignName] = useState("");
  const [loginCampaignId, setLoginCampaignId] = useState("");

  // Set dark mode
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  // Global WebSocket connection to receive login required alerts anywhere in the app
  useCampaignWebSocket({
    onLoginRequired: (campaignId, campaignName) => {
      console.log('🚨 GLOBAL Login modal triggered for campaign:', campaignName);
      setLoginCampaignId(campaignId);
      setLoginCampaignName(campaignName);
      setIsLoginModalOpen(true);
    }
  });

  return (
    <>
      <Router />
      
      {/* Global Login Required Modal - Shows everywhere in the app */}
      <Dialog open={isLoginModalOpen} onOpenChange={setIsLoginModalOpen}>
        <DialogContent className="sm:max-w-[500px] border-2 border-destructive">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/20 border-2 border-destructive">
                <AlertCircle className="h-7 w-7 text-destructive" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-destructive">
                  Manual Login Required
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Campaign: {loginCampaignName}
                </p>
              </div>
            </div>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <Alert variant="default" className="border-primary bg-primary/5">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="ml-2">
                A browser window should have opened automatically. Please complete the Google login to continue.
              </AlertDescription>
            </Alert>

            <div className="rounded-lg bg-muted p-4 space-y-3">
              <p className="font-semibold text-sm">Steps to complete login:</p>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Enter your Google email address</li>
                <li>Click "Next"</li>
                <li>Enter your password</li>
                <li>Click "Next"</li>
                <li>Complete any 2FA verification (if enabled)</li>
                <li>Accept any terms or security prompts</li>
                <li>Wait for Google Voice interface to load</li>
              </ol>
            </div>

            <Alert variant="default" className="border-muted-foreground/20">
              <AlertDescription className="text-xs">
                <strong>Note:</strong> Your login session will be saved for future use. You will only need to login once unless you clear browser data.
              </AlertDescription>
            </Alert>

            <p className="text-sm text-muted-foreground">
              The campaign will automatically resume once you successfully log in. The browser will check your login status every 20 seconds.
            </p>
          </div>

          <DialogFooter>
            <Button 
              onClick={() => setIsLoginModalOpen(false)} 
              variant="outline"
              data-testid="button-close-login-modal"
            >
              I understand
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
