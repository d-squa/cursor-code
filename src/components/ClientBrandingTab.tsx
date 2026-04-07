import { useState, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, X, Loader2, Palette } from "lucide-react";

interface ClientBrandingProps {
  clientId: string;
  initialData?: {
    client_logo_url?: string | null;
    agency_logo_url?: string | null;
    brand_font_color?: string | null;
    brand_background_color?: string | null;
    brand_foreground_color?: string | null;
  };
  onUpdate: (data: Record<string, any>) => void;
}

export function ClientBrandingTab({ clientId, initialData, onUpdate }: ClientBrandingProps) {
  const [clientLogo, setClientLogo] = useState(initialData?.client_logo_url || "");
  const [agencyLogo, setAgencyLogo] = useState(initialData?.agency_logo_url || "");
  const [fontColor, setFontColor] = useState(initialData?.brand_font_color || "#1a1a2e");
  const [bgColor, setBgColor] = useState(initialData?.brand_background_color || "#ffffff");
  const [fgColor, setFgColor] = useState(initialData?.brand_foreground_color || "#428bca");
  const [uploading, setUploading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const clientLogoRef = useRef<HTMLInputElement>(null);
  const agencyLogoRef = useRef<HTMLInputElement>(null);

  const uploadLogo = async (file: File, type: "client" | "agency") => {
    setUploading(type);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const ext = file.name.split(".").pop();
      const path = `${user.id}/${clientId}/${type}-logo-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("client-branding-assets")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("client-branding-assets")
        .getPublicUrl(path);

      if (type === "client") setClientLogo(publicUrl);
      else setAgencyLogo(publicUrl);

      toast.success(`${type === "client" ? "Client" : "Agency"} logo uploaded`);
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("Failed to upload logo");
    } finally {
      setUploading(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updateData = {
        client_logo_url: clientLogo || null,
        agency_logo_url: agencyLogo || null,
        brand_font_color: fontColor || null,
        brand_background_color: bgColor || null,
        brand_foreground_color: fgColor || null,
      };

      const { error } = await (supabase as any)
        .from("clients")
        .update(updateData)
        .eq("id", clientId);

      if (error) throw error;
      onUpdate(updateData);
      toast.success("Branding settings saved");
    } catch (err: any) {
      console.error("Save error:", err);
      toast.error("Failed to save branding");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Palette className="h-4 w-4" />
          Client Branding
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Logos and theme colors used in PDF/Excel exports
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Logos */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Client Logo</Label>
            <div className="border rounded-lg p-3 flex flex-col items-center gap-2 min-h-[100px] justify-center bg-muted/30">
              {clientLogo ? (
                <div className="relative">
                  <img src={clientLogo} alt="Client logo" className="max-h-16 max-w-full object-contain" />
                  <Button variant="ghost" size="icon" className="absolute -top-2 -right-2 h-5 w-5" onClick={() => setClientLogo("")}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => clientLogoRef.current?.click()} disabled={uploading === "client"}>
                  {uploading === "client" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
                  Upload
                </Button>
              )}
              <input ref={clientLogoRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0], "client")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Agency Logo</Label>
            <div className="border rounded-lg p-3 flex flex-col items-center gap-2 min-h-[100px] justify-center bg-muted/30">
              {agencyLogo ? (
                <div className="relative">
                  <img src={agencyLogo} alt="Agency logo" className="max-h-16 max-w-full object-contain" />
                  <Button variant="ghost" size="icon" className="absolute -top-2 -right-2 h-5 w-5" onClick={() => setAgencyLogo("")}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => agencyLogoRef.current?.click()} disabled={uploading === "agency"}>
                  {uploading === "agency" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
                  Upload
                </Button>
              )}
              <input ref={agencyLogoRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0], "agency")} />
            </div>
          </div>
        </div>

        {/* Theme Colors */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Theme Colors</Label>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Font Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={fontColor} onChange={(e) => setFontColor(e.target.value)}
                  className="w-8 h-8 rounded border cursor-pointer" />
                <Input value={fontColor} onChange={(e) => setFontColor(e.target.value)}
                  className="h-8 text-xs font-mono" placeholder="#1a1a2e" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Background Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)}
                  className="w-8 h-8 rounded border cursor-pointer" />
                <Input value={bgColor} onChange={(e) => setBgColor(e.target.value)}
                  className="h-8 text-xs font-mono" placeholder="#ffffff" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Accent Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={fgColor} onChange={(e) => setFgColor(e.target.value)}
                  className="w-8 h-8 rounded border cursor-pointer" />
                <Input value={fgColor} onChange={(e) => setFgColor(e.target.value)}
                  className="h-8 text-xs font-mono" placeholder="#428bca" />
              </div>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Preview</Label>
          <div className="border rounded-lg p-4 flex items-center justify-between" style={{ backgroundColor: bgColor }}>
            <div className="flex items-center gap-3">
              {clientLogo && <img src={clientLogo} alt="Client" className="h-8 object-contain" />}
              <span className="text-sm font-semibold" style={{ color: fontColor }}>Media Plan Report</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-6 w-16 rounded" style={{ backgroundColor: fgColor }} />
              {agencyLogo && <img src={agencyLogo} alt="Agency" className="h-8 object-contain" />}
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Branding
        </Button>
      </CardContent>
    </Card>
  );
}
