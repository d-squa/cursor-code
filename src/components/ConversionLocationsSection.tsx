import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Save, Loader2, Globe, Smartphone, MessageSquare, Phone } from "lucide-react";
import { 
  META_OPTIMIZATION_LOCATIONS, 
  META_APP_STORES, 
  META_MESSAGING_MODES,
  TIKTOK_OPTIMIZATION_LOCATIONS,
  TIKTOK_MESSAGING_APPS 
} from "@/utils/destinationOptions";
import MetaAppSearch from "./MetaAppSearch";

interface ConversionLocationData {
  // Website
  landingPageUrl?: string;
  // App (Meta)
  appStore?: string;
  appId?: string;
  appName?: string;
  // App (TikTok) - uses appId and appName
  // Messaging (Meta)
  messagingMode?: string;
  messengerEnabled?: boolean;
  instagramDmEnabled?: boolean;
  whatsappEnabled?: boolean;
  whatsappNumber?: string;
  // Messaging (TikTok)
  messagingApp?: string;
  facebookPageId?: string;
  messageEventSet?: string;
  zaloAccountId?: string;
  lineBusinessId?: string;
}

interface ConfiguredLocation {
  locationType: string;
  data: ConversionLocationData;
}

interface Props {
  platform: 'meta' | 'tiktok';
  accountId: string;
  metaAdAccountId?: string; // For Meta app search
  configuredLocations: ConfiguredLocation[];
  onSaveLocation: (locationType: string, data: ConversionLocationData) => Promise<void>;
  onDeleteLocation: (locationType: string) => Promise<void>;
  // Resources for dropdowns
  pages?: Array<{ page_id: string; page_name: string }>;
  instagramAccounts?: Array<{ instagram_account_id: string; username: string }>;
  tiktokApps?: Array<{ app_id: string; app_name: string }>;
  tiktokEvents?: Array<{ id: string; name: string }>;
  saving?: string | null;
}

const LOCATION_ICONS: Record<string, React.ReactNode> = {
  "WEBSITE": <Globe className="h-4 w-4" />,
  "Website": <Globe className="h-4 w-4" />,
  "APP": <Smartphone className="h-4 w-4" />,
  "App": <Smartphone className="h-4 w-4" />,
  "MESSAGING_APPS": <MessageSquare className="h-4 w-4" />,
  "Instant Messaging Apps": <MessageSquare className="h-4 w-4" />,
  "TikTok Direct Messages": <MessageSquare className="h-4 w-4" />,
  "CALLS": <Phone className="h-4 w-4" />,
  "Phone Call": <Phone className="h-4 w-4" />,
};

export default function ConversionLocationsSection({
  platform,
  accountId,
  metaAdAccountId,
  configuredLocations,
  onSaveLocation,
  onDeleteLocation,
  pages = [],
  instagramAccounts = [],
  tiktokApps = [],
  tiktokEvents = [],
  saving,
}: Props) {
  const [editingLocation, setEditingLocation] = useState<string | null>(null);
  const [localData, setLocalData] = useState<Record<string, ConversionLocationData>>({});
  const [addingLocation, setAddingLocation] = useState<string | null>(null);

  const locationOptions = platform === 'meta' ? META_OPTIMIZATION_LOCATIONS : TIKTOK_OPTIMIZATION_LOCATIONS;
  
  // Get locations that are not yet configured
  const configuredTypes = configuredLocations.map(loc => loc.locationType);
  const availableLocations = locationOptions.filter(loc => !configuredTypes.includes(loc.value));

  const handleAddLocation = (locationType: string) => {
    setAddingLocation(locationType);
    setLocalData(prev => ({
      ...prev,
      [locationType]: {}
    }));
  };

  const handleCancelAdd = () => {
    if (addingLocation) {
      setLocalData(prev => {
        const next = { ...prev };
        delete next[addingLocation];
        return next;
      });
    }
    setAddingLocation(null);
  };

  const handleSaveNew = async (locationType: string) => {
    const data = localData[locationType] || {};
    await onSaveLocation(locationType, data);
    setAddingLocation(null);
    setLocalData(prev => {
      const next = { ...prev };
      delete next[locationType];
      return next;
    });
  };

  const handleStartEdit = (loc: ConfiguredLocation) => {
    setEditingLocation(loc.locationType);
    setLocalData(prev => ({
      ...prev,
      [loc.locationType]: { ...loc.data }
    }));
  };

  const handleSaveEdit = async (locationType: string) => {
    const data = localData[locationType] || {};
    await onSaveLocation(locationType, data);
    setEditingLocation(null);
  };

  const handleCancelEdit = (locationType: string) => {
    setEditingLocation(null);
    setLocalData(prev => {
      const next = { ...prev };
      delete next[locationType];
      return next;
    });
  };

  const updateLocalData = (locationType: string, field: keyof ConversionLocationData, value: any) => {
    setLocalData(prev => ({
      ...prev,
      [locationType]: {
        ...prev[locationType],
        [field]: value
      }
    }));
  };

  const getLocationLabel = (value: string) => {
    return locationOptions.find(loc => loc.value === value)?.label || value;
  };

  const renderLocationFields = (locationType: string, data: ConversionLocationData, isEditing: boolean) => {
    const currentData = isEditing ? (localData[locationType] || data) : data;

    // Website location
    if (locationType === 'WEBSITE' || locationType === 'Website' || locationType === 'TikTok Instant Page') {
      return (
        <div className="space-y-2">
          <Label>Landing Page URL</Label>
          {isEditing ? (
            <Input
              value={currentData.landingPageUrl || ''}
              onChange={(e) => updateLocalData(locationType, 'landingPageUrl', e.target.value)}
              placeholder="https://example.com"
            />
          ) : (
            <p className="text-sm text-muted-foreground">{currentData.landingPageUrl || 'Not configured'}</p>
          )}
        </div>
      );
    }

    // App location - Meta
    if (platform === 'meta' && locationType === 'APP') {
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>App Store</Label>
            {isEditing ? (
              <Select
                value={currentData.appStore || ''}
                onValueChange={(v) => updateLocalData(locationType, 'appStore', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select app store" />
                </SelectTrigger>
                <SelectContent>
                  {META_APP_STORES.map(store => (
                    <SelectItem key={store.value} value={store.value}>{store.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                {META_APP_STORES.find(s => s.value === currentData.appStore)?.label || 'Not configured'}
              </p>
            )}
          </div>
          {currentData.appStore && metaAdAccountId && (
            <div className="space-y-2">
              <Label>App</Label>
              {isEditing ? (
                <MetaAppSearch
                  appStore={currentData.appStore}
                  adAccountId={metaAdAccountId}
                  value={currentData.appId || null}
                  onChange={(appId, appName) => {
                    updateLocalData(locationType, 'appId', appId);
                    updateLocalData(locationType, 'appName', appName || '');
                  }}
                />
              ) : (
                <p className="text-sm text-muted-foreground">{currentData.appName || 'Not selected'}</p>
              )}
            </div>
          )}
        </div>
      );
    }

    // App location - TikTok
    if (platform === 'tiktok' && (locationType === 'App' || locationType === 'Website & App')) {
      return (
        <div className="space-y-4">
          {locationType === 'Website & App' && (
            <div className="space-y-2">
              <Label>Landing Page URL</Label>
              {isEditing ? (
                <Input
                  value={currentData.landingPageUrl || ''}
                  onChange={(e) => updateLocalData(locationType, 'landingPageUrl', e.target.value)}
                  placeholder="https://example.com"
                />
              ) : (
                <p className="text-sm text-muted-foreground">{currentData.landingPageUrl || 'Not configured'}</p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label>App</Label>
            {isEditing ? (
              <Select
                value={currentData.appId || ''}
                onValueChange={(v) => {
                  const app = tiktokApps.find(a => a.app_id === v);
                  updateLocalData(locationType, 'appId', v);
                  updateLocalData(locationType, 'appName', app?.app_name || '');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select app" />
                </SelectTrigger>
                <SelectContent>
                  {tiktokApps.map(app => (
                    <SelectItem key={app.app_id} value={app.app_id}>{app.app_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">{currentData.appName || 'Not selected'}</p>
            )}
          </div>
        </div>
      );
    }

    // Messaging - Meta
    if (platform === 'meta' && locationType === 'MESSAGING_APPS') {
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Messaging Mode</Label>
            {isEditing ? (
              <Select
                value={currentData.messagingMode || ''}
                onValueChange={(v) => updateLocalData(locationType, 'messagingMode', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  {META_MESSAGING_MODES.map(mode => (
                    <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                {META_MESSAGING_MODES.find(m => m.value === currentData.messagingMode)?.label || 'Not configured'}
              </p>
            )}
          </div>
          {currentData.messagingMode === 'MANUAL' && (
            <div className="space-y-3">
              <Label>Channels</Label>
              {isEditing ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={currentData.messengerEnabled || false}
                      onCheckedChange={(c) => updateLocalData(locationType, 'messengerEnabled', c)}
                    />
                    <span className="text-sm">Facebook Messenger</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={currentData.instagramDmEnabled || false}
                      onCheckedChange={(c) => updateLocalData(locationType, 'instagramDmEnabled', c)}
                    />
                    <span className="text-sm">Instagram Direct</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={currentData.whatsappEnabled || false}
                      onCheckedChange={(c) => updateLocalData(locationType, 'whatsappEnabled', c)}
                    />
                    <span className="text-sm">WhatsApp</span>
                  </div>
                  {currentData.whatsappEnabled && (
                    <Input
                      value={currentData.whatsappNumber || ''}
                      onChange={(e) => updateLocalData(locationType, 'whatsappNumber', e.target.value)}
                      placeholder="WhatsApp Business Number"
                      className="mt-2"
                    />
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {currentData.messengerEnabled && <Badge variant="secondary">Messenger</Badge>}
                  {currentData.instagramDmEnabled && <Badge variant="secondary">Instagram DM</Badge>}
                  {currentData.whatsappEnabled && <Badge variant="secondary">WhatsApp</Badge>}
                  {!currentData.messengerEnabled && !currentData.instagramDmEnabled && !currentData.whatsappEnabled && (
                    <span className="text-sm text-muted-foreground">No channels selected</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    // Messaging - TikTok (Instant Messaging Apps)
    if (platform === 'tiktok' && locationType === 'Instant Messaging Apps') {
      const selectedApp = TIKTOK_MESSAGING_APPS.find(a => a.value === currentData.messagingApp);
      
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Messaging App</Label>
            {isEditing ? (
              <Select
                value={currentData.messagingApp || ''}
                onValueChange={(v) => updateLocalData(locationType, 'messagingApp', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select messaging app" />
                </SelectTrigger>
                <SelectContent>
                  {TIKTOK_MESSAGING_APPS.map(app => (
                    <SelectItem key={app.value} value={app.value}>{app.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">{selectedApp?.label || 'Not selected'}</p>
            )}
          </div>
          
          {/* Messenger fields */}
          {currentData.messagingApp === 'MESSENGER' && (
            <>
              <div className="space-y-2">
                <Label>Facebook Page ID</Label>
                {isEditing ? (
                  <Input
                    value={currentData.facebookPageId || ''}
                    onChange={(e) => updateLocalData(locationType, 'facebookPageId', e.target.value)}
                    placeholder="Facebook Page ID"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{currentData.facebookPageId || 'Not configured'}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Message Event Set</Label>
                {isEditing ? (
                  <Select
                    value={currentData.messageEventSet || ''}
                    onValueChange={(v) => updateLocalData(locationType, 'messageEventSet', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select event set" />
                    </SelectTrigger>
                    <SelectContent>
                      {tiktokEvents.map(event => (
                        <SelectItem key={event.id} value={event.id}>{event.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {tiktokEvents.find(e => e.id === currentData.messageEventSet)?.name || 'Not configured'}
                  </p>
                )}
              </div>
            </>
          )}
          
          {/* WhatsApp fields */}
          {currentData.messagingApp === 'WHATSAPP' && (
            <>
              <div className="space-y-2">
                <Label>WhatsApp Number</Label>
                {isEditing ? (
                  <Input
                    value={currentData.whatsappNumber || ''}
                    onChange={(e) => updateLocalData(locationType, 'whatsappNumber', e.target.value)}
                    placeholder="WhatsApp Business Number"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{currentData.whatsappNumber || 'Not configured'}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Message Event Set</Label>
                {isEditing ? (
                  <Select
                    value={currentData.messageEventSet || ''}
                    onValueChange={(v) => updateLocalData(locationType, 'messageEventSet', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select event set" />
                    </SelectTrigger>
                    <SelectContent>
                      {tiktokEvents.map(event => (
                        <SelectItem key={event.id} value={event.id}>{event.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {tiktokEvents.find(e => e.id === currentData.messageEventSet)?.name || 'Not configured'}
                  </p>
                )}
              </div>
            </>
          )}
          
          {/* Zalo fields */}
          {currentData.messagingApp === 'ZALO' && (
            <div className="space-y-2">
              <Label>Zalo Account ID</Label>
              {isEditing ? (
                <Input
                  value={currentData.zaloAccountId || ''}
                  onChange={(e) => updateLocalData(locationType, 'zaloAccountId', e.target.value)}
                  placeholder="Zalo Official Account ID"
                />
              ) : (
                <p className="text-sm text-muted-foreground">{currentData.zaloAccountId || 'Not configured'}</p>
              )}
            </div>
          )}
          
          {/* LINE fields */}
          {currentData.messagingApp === 'LINE' && (
            <div className="space-y-2">
              <Label>LINE Business ID</Label>
              {isEditing ? (
                <Input
                  value={currentData.lineBusinessId || ''}
                  onChange={(e) => updateLocalData(locationType, 'lineBusinessId', e.target.value)}
                  placeholder="LINE Business ID"
                />
              ) : (
                <p className="text-sm text-muted-foreground">{currentData.lineBusinessId || 'Not configured'}</p>
              )}
            </div>
          )}
        </div>
      );
    }

    // TikTok Direct Messages
    if (platform === 'tiktok' && locationType === 'TikTok Direct Messages') {
      return (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            TikTok Direct Messages - No additional configuration required
          </p>
        </div>
      );
    }

    // Calls / Phone Call
    if (locationType === 'CALLS' || locationType === 'Phone Call') {
      return (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {platform === 'meta' 
              ? 'Calls will use the connected Facebook Page phone number'
              : 'Phone Call - Configure in TikTok Ads Manager'}
          </p>
        </div>
      );
    }

    // TikTok Shop
    if (locationType === 'TikTok Shop') {
      return (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            TikTok Shop - Configure in TikTok Seller Center
          </p>
        </div>
      );
    }

    // Instant Form
    if (locationType === 'Instant Form') {
      return (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Instant Form - Forms are created in TikTok Ads Manager
          </p>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium">Conversion Locations</h4>
          <p className="text-sm text-muted-foreground">
            Configure each destination type once. Values auto-populate when objectives require them.
          </p>
        </div>
        
        {availableLocations.length > 0 && !addingLocation && (
          <Select onValueChange={handleAddLocation}>
            <SelectTrigger className="w-[200px]">
              <Plus className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Add location" />
            </SelectTrigger>
            <SelectContent>
              {availableLocations.map(loc => (
                <SelectItem key={loc.value} value={loc.value}>{loc.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Adding new location */}
      {addingLocation && (
        <Card className="p-4 border-dashed border-2 border-primary/50">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {LOCATION_ICONS[addingLocation]}
                <span className="font-medium">{getLocationLabel(addingLocation)}</span>
                <Badge variant="outline">New</Badge>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancelAdd}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleSaveNew(addingLocation)}
                  disabled={saving === `new-${addingLocation}`}
                >
                  {saving === `new-${addingLocation}` ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save
                </Button>
              </div>
            </div>
            {renderLocationFields(addingLocation, localData[addingLocation] || {}, true)}
          </div>
        </Card>
      )}

      {/* Configured locations */}
      {configuredLocations.map(loc => {
        const isEditing = editingLocation === loc.locationType;
        
        return (
          <Card key={loc.locationType} className="p-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {LOCATION_ICONS[loc.locationType]}
                  <span className="font-medium">{getLocationLabel(loc.locationType)}</span>
                  <Badge variant="secondary">Configured</Badge>
                </div>
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCancelEdit(loc.locationType)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSaveEdit(loc.locationType)}
                        disabled={saving === loc.locationType}
                      >
                        {saving === loc.locationType ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        Save
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStartEdit(loc)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => onDeleteLocation(loc.locationType)}
                        disabled={saving === `delete-${loc.locationType}`}
                      >
                        {saving === `delete-${loc.locationType}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {renderLocationFields(loc.locationType, loc.data, isEditing)}
            </div>
          </Card>
        );
      })}

      {configuredLocations.length === 0 && !addingLocation && (
        <Card className="p-8 border-dashed">
          <p className="text-center text-muted-foreground">
            No conversion locations configured. Add a location to set up defaults.
          </p>
        </Card>
      )}
    </div>
  );
}
