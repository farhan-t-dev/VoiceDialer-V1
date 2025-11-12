import { useState } from "react";
import { Settings as SettingsIcon, ArrowLeft, Chrome, FileText } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function Settings() {
  const { toast } = useToast();
  const [isOpeningBrowser, setIsOpeningBrowser] = useState(false);
  const [isOpeningFile, setIsOpeningFile] = useState(false);

  const handleOpenGoogleVoice = async () => {
    setIsOpeningBrowser(true);
    try {
      await apiRequest("POST", "/api/settings/open-google-voice");
      toast({ 
        title: "Opening Google Voice",
        description: "Chromium browser opened with your Google Voice profile"
      });
    } catch (error) {
      toast({ 
        title: "Failed to open browser", 
        description: "Make sure Chrome/Chromium is installed",
        variant: "destructive" 
      });
    } finally {
      setIsOpeningBrowser(false);
    }
  };

  const handleOpenEnvFile = async () => {
    setIsOpeningFile(true);
    try {
      await apiRequest("POST", "/api/settings/open-env-file");
      toast({ 
        title: "Opening .env file",
        description: "Edit your API keys and save the file"
      });
    } catch (error) {
      toast({ 
        title: "Failed to open file", 
        description: "Make sure you have a text editor installed",
        variant: "destructive" 
      });
    } finally {
      setIsOpeningFile(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b px-4 sm:px-6 backdrop-blur supports-[backdrop-filter]:bg-background/95">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border-2 border-primary/20">
            <SettingsIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="hidden sm:block min-w-0">
            <h1 className="text-lg font-semibold truncate">Settings</h1>
            <p className="text-xs text-muted-foreground truncate">Configure API credentials and integrations</p>
          </div>
        </div>
        
        <ThemeToggle />
      </header>

      <main className="flex-1 overflow-auto p-4 sm:p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Google Voice Login</CardTitle>
            <CardDescription>
              Login to Google Voice manually - your session will be saved automatically
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Click the button below to open Google Voice in Chromium. Login with your Google account, 
              and your session will persist for future automated calls.
            </p>
            <Button 
              onClick={handleOpenGoogleVoice} 
              disabled={isOpeningBrowser} 
              data-testid="button-open-google-voice"
              className="w-full sm:w-auto"
            >
              <Chrome className="h-4 w-4 mr-2" />
              {isOpeningBrowser ? "Opening..." : "Open Google Voice in Browser"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API Configuration</CardTitle>
            <CardDescription>
              Edit your ElevenLabs API key and other settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Click the button below to open the .env file where you can add or update your API keys.
              After making changes, save the file and restart the application.
            </p>
            <Button 
              onClick={handleOpenEnvFile} 
              disabled={isOpeningFile} 
              data-testid="button-open-env"
              className="w-full sm:w-auto"
            >
              <FileText className="h-4 w-4 mr-2" />
              {isOpeningFile ? "Opening..." : "Edit .env File"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Setup Guide</CardTitle>
            <CardDescription>
              Quick setup instructions for first-time configuration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Step 1: Configure ElevenLabs API</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground ml-4">
                <li>Sign up at elevenlabs.io and create an API key</li>
                <li>Click "Edit .env File" button above</li>
                <li>Add your API key: ELEVENLABS_API_KEY=sk_your_key_here</li>
                <li>Save the file and restart the application</li>
              </ol>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Step 2: Login to Google Voice</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground ml-4">
                <li>Click "Open Google Voice in Browser" button above</li>
                <li>Login with your Google Voice account</li>
                <li>Close the browser when done - your session is saved</li>
                <li>The app will use this session for automated calls</li>
              </ol>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Step 3: Configure Virtual Audio Cable</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground ml-4">
                <li>Install VB-Audio Virtual Cable (2 cables minimum)</li>
                <li>Set Line 1 as Windows default playback device</li>
                <li>Set Line 2 as Windows default recording device</li>
                <li>Set Line 2 volume to 100% in Windows Sound Settings</li>
                <li>Download SoX and place in tools/ directory (see tools/README.md)</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
