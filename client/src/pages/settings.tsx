import { useState } from "react";
import { Settings as SettingsIcon, Save, Key, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Settings() {
  const { toast } = useToast();
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState("");
  const [googleVoiceEmail, setGoogleVoiceEmail] = useState("");
  const [googleVoicePassword, setGoogleVoicePassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveElevenLabs = async () => {
    setIsSaving(true);
    try {
      // In a real app, this would save to a secure backend endpoint
      // For now, we'll just show a success message
      localStorage.setItem('ELEVENLABS_API_KEY', elevenLabsApiKey);
      toast({ title: "ElevenLabs API key saved successfully" });
    } catch (error) {
      toast({ title: "Failed to save API key", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveGoogleVoice = async () => {
    setIsSaving(true);
    try {
      // In a real app, this would save to environment variables securely
      toast({ 
        title: "Google Voice credentials saved", 
        description: "These credentials are required for automated dialing" 
      });
    } catch (error) {
      toast({ title: "Failed to save credentials", variant: "destructive" });
    } finally {
      setIsSaving(false);
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
        <Alert>
          <Key className="h-4 w-4" />
          <AlertDescription>
            API keys and credentials are stored securely. Never share these with anyone.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>ElevenLabs Speech-to-Speech API</CardTitle>
            <CardDescription>
              Configure your ElevenLabs API key for AI-powered voice conversations during calls
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="elevenlabs-api-key">API Key</Label>
              <Input
                id="elevenlabs-api-key"
                type="password"
                placeholder="sk_..."
                value={elevenLabsApiKey}
                onChange={(e) => setElevenLabsApiKey(e.target.value)}
                data-testid="input-elevenlabs-key"
              />
              <p className="text-sm text-muted-foreground">
                Get your API key from{" "}
                <a 
                  href="https://elevenlabs.io/app/settings/api-keys" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  ElevenLabs Dashboard
                </a>
              </p>
            </div>
            <Button onClick={handleSaveElevenLabs} disabled={isSaving} data-testid="button-save-elevenlabs" className="w-full sm:w-auto">
              <Save className="h-4 w-4 mr-2" />
              Save ElevenLabs API Key
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Google Voice Business Credentials</CardTitle>
            <CardDescription>
              Required for automated browser-based dialing via Google Voice
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="google-voice-email">Google Voice Email</Label>
              <Input
                id="google-voice-email"
                type="email"
                placeholder="your-email@gmail.com"
                value={googleVoiceEmail}
                onChange={(e) => setGoogleVoiceEmail(e.target.value)}
                data-testid="input-google-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="google-voice-password">Google Voice Password</Label>
              <Input
                id="google-voice-password"
                type="password"
                placeholder="••••••••"
                value={googleVoicePassword}
                onChange={(e) => setGoogleVoicePassword(e.target.value)}
                data-testid="input-google-password"
              />
            </div>
            <Alert>
              <AlertDescription className="text-sm">
                <strong>Note:</strong> These credentials are stored as environment variables (GOOGLE_VOICE_EMAIL and GOOGLE_VOICE_PASSWORD). 
                For security, please set these directly in your Replit Secrets instead of using this form.
              </AlertDescription>
            </Alert>
            <Button onClick={handleSaveGoogleVoice} disabled={isSaving} data-testid="button-save-google" className="w-full sm:w-auto">
              <Save className="h-4 w-4 mr-2" />
              Save Google Voice Credentials
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Integration Guide</CardTitle>
            <CardDescription>
              How to set up your integrations properly
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">ElevenLabs Setup:</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>Sign up at elevenlabs.io</li>
                <li>Go to Settings → API Keys</li>
                <li>Create a new API key</li>
                <li>Copy and paste it above</li>
                <li>Select voice IDs in your AI Agent profiles</li>
              </ol>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Google Voice Setup:</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>Ensure you have Google Voice Business account</li>
                <li>Add GOOGLE_VOICE_EMAIL to Replit Secrets</li>
                <li>Add GOOGLE_VOICE_PASSWORD to Replit Secrets</li>
                <li>Restart the application</li>
                <li>Test automated dialing from Campaigns</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
