import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Send, Loader2, X, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface BugReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const BugReportDialog = ({ open, onOpenChange }: BugReportDialogProps) => {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const captureScreenshot = async () => {
    setIsCapturing(true);
    try {
      // Use browser's native screenshot API if available
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        const stream = await navigator.mediaDevices.getDisplayMedia({ 
          video: { displaySurface: "browser" } as any
        });
        
        const video = document.createElement("video");
        video.srcObject = stream;
        await video.play();
        
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(video, 0, 0);
        
        stream.getTracks().forEach(track => track.stop());
        
        const dataUrl = canvas.toDataURL("image/png");
        setScreenshot(dataUrl);
        toast.success("Screenshot captured!");
      } else {
        toast.error("Screenshot capture not supported in this browser. Please upload an image instead.");
      }
    } catch (error: any) {
      if (error.name !== "NotAllowedError") {
        toast.error("Failed to capture screenshot");
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File size must be less than 5MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setScreenshot(reader.result as string);
        toast.success("Image uploaded!");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !description.trim() || !severity) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("send-bug-report", {
        body: {
          title,
          description,
          severity,
          screenshot,
          userEmail: user?.email,
          currentUrl: window.location.href,
          userAgent: navigator.userAgent
        }
      });
      
      if (error) throw error;
      
      toast.success("Bug report submitted successfully! A copy has been sent to your email.");
      setTitle("");
      setDescription("");
      setSeverity("");
      setScreenshot(null);
      onOpenChange(false);
    } catch (error: any) {
      console.error("Bug report error:", error);
      toast.error("Failed to submit bug report. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const removeScreenshot = () => {
    setScreenshot(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Report a Bug</DialogTitle>
          <DialogDescription>
            Help us improve ActiPlan by reporting any issues you encounter.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief description of the issue"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="severity">Severity *</Label>
            <Select value={severity} onValueChange={setSeverity} required>
              <SelectTrigger>
                <SelectValue placeholder="Select severity level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low - Minor issue, workaround available</SelectItem>
                <SelectItem value="medium">Medium - Affects workflow, needs attention</SelectItem>
                <SelectItem value="high">High - Blocks major functionality</SelectItem>
                <SelectItem value="critical">Critical - System unusable</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please describe what happened, what you expected, and steps to reproduce..."
              rows={4}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label>Screenshot (optional)</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={captureScreenshot}
                disabled={isCapturing}
                className="gap-2"
              >
                {isCapturing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                Capture Screen
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
              >
                <ImageIcon className="h-4 w-4" />
                Upload Image
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
            
            {screenshot && (
              <div className="relative mt-2">
                <img 
                  src={screenshot} 
                  alt="Screenshot preview" 
                  className="max-h-40 rounded-lg border"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6"
                  onClick={removeScreenshot}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Submit Report
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
