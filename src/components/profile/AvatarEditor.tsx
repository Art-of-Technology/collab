"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import Image from 'next/image';

interface AvatarEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: any;
  onSave: (data: any) => Promise<void>;
}

type FaceLayerType = 'skintone' | 'eyes' | 'brows' | 'mouth' | 'nose' | 'hair' | 'eyewear' | 'accessory';

// Default counts as fallback
const DEFAULT_LAYER_COUNTS = {
  skintone: 6,
  eyes: 60,
  brows: 47,
  mouth: 105,
  nose: 69,
  hair: 349,
  eyewear: 26,
  accessory: 15,
};

export default function AvatarEditor({ open, onOpenChange, user, onSave }: AvatarEditorProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [layerCounts, setLayerCounts] = useState(DEFAULT_LAYER_COUNTS);
  
  // Separate state for each avatar part for more reliable updates
  const [useCustomAvatar, setUseCustomAvatar] = useState(user.useCustomAvatar || false);
  const [skinTone, setSkinTone] = useState(user.avatarSkinTone || 1);
  const [eyes, setEyes] = useState(user.avatarEyes || 1);
  const [brows, setBrows] = useState(user.avatarBrows || 1);
  const [mouth, setMouth] = useState(user.avatarMouth || 1);
  const [nose, setNose] = useState(user.avatarNose || 1);
  const [hair, setHair] = useState(user.avatarHair || 1);
  const [eyewear, setEyewear] = useState(user.avatarEyewear || 0);
  const [accessory, setAccessory] = useState(user.avatarAccessory || 0);
  
  // Reset all avatar parts when modal opens
  useEffect(() => {
    if (open) {
      setUseCustomAvatar(user.useCustomAvatar || false);
      setSkinTone(user.avatarSkinTone || 1);
      setEyes(user.avatarEyes || 1);
      setBrows(user.avatarBrows || 1);
      setMouth(user.avatarMouth || 1);
      setNose(user.avatarNose || 1);
      setHair(user.avatarHair || 1);
      setEyewear(user.avatarEyewear || 0);
      setAccessory(user.avatarAccessory || 0);
      fetchLayerCounts();
    }
  }, [user, open]);
  
  // Fetch actual counts from the API
  const fetchLayerCounts = async () => {
    try {
      const response = await fetch('/api/face-layers/counts');
      if (response.ok) {
        const data = await response.json();
        if (data.layerCounts) {
          setLayerCounts(data.layerCounts);
        }
      }
    } catch (error) {
      console.error('Failed to fetch layer counts:', error);
    }
  };
  
  // Helper to get the current preview user object
  const getPreviewUser = useCallback(() => {
    return {
      ...user,
      useCustomAvatar,
      avatarSkinTone: skinTone,
      avatarEyes: eyes,
      avatarBrows: brows,
      avatarMouth: mouth,
      avatarNose: nose,
      avatarHair: hair,
      avatarEyewear: eyewear,
      avatarAccessory: accessory,
    };
  }, [
    user, useCustomAvatar, skinTone, eyes, brows, 
    mouth, nose, hair, eyewear, accessory
  ]);
  
  // Handle selecting a layer type
  const handleSelectLayer = (type: FaceLayerType, index: number) => {
    // Always enable custom avatar when selecting a layer
    setUseCustomAvatar(true);
    
    // Update the specific part based on type
    switch (type) {
      case 'skintone':
        setSkinTone(index);
        break;
      case 'eyes':
        setEyes(index);
        break;
      case 'brows':
        setBrows(index);
        break;
      case 'mouth':
        setMouth(index);
        break;
      case 'nose':
        setNose(index);
        break;
      case 'hair':
        setHair(index);
        break;
      case 'eyewear':
        setEyewear(index);
        break;
      case 'accessory':
        setAccessory(index);
        break;
    }
  };
  
  const toggleCustomAvatar = (enabled: boolean) => {
    setUseCustomAvatar(enabled);
  };
  
  const handleRandomize = () => {
    const randomize = (max: number, allowZero = false) => {
      if (allowZero) {
        // 20% chance of getting 0 (no item) for optional items
        return Math.random() < 0.2 ? 0 : Math.floor(Math.random() * max) + 1;
      }
      return Math.floor(Math.random() * max) + 1;
    };
    
    setUseCustomAvatar(true);
    setSkinTone(randomize(layerCounts.skintone));
    setEyes(randomize(layerCounts.eyes));
    setBrows(randomize(layerCounts.brows));
    setMouth(randomize(layerCounts.mouth));
    setNose(randomize(layerCounts.nose));
    setHair(randomize(layerCounts.hair));
    setEyewear(randomize(layerCounts.eyewear, true));
    setAccessory(randomize(layerCounts.accessory, true));
  };
  
  const handleSave = async () => {
    setIsLoading(true);
    try {
      // Create the user object with our current state
      const updatedUser = getPreviewUser();
      
      await onSave(updatedUser);
      toast({
        title: "Success",
        description: "Avatar updated successfully",
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving avatar:', error);
      toast({
        title: "Error",
        description: "Failed to update avatar",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const renderLayerOptions = (type: FaceLayerType, count: number, allowNone = false) => {
    // Get the current value for this layer type
    const getCurrentValue = () => {
      switch (type) {
        case 'skintone': return skinTone;
        case 'eyes': return eyes;
        case 'brows': return brows;
        case 'mouth': return mouth;
        case 'nose': return nose;
        case 'hair': return hair;
        case 'eyewear': return eyewear;
        case 'accessory': return accessory;
        default: return 0;
      }
    };
    
    const currentValue = getCurrentValue();
    const options = [];
    
    // Add "None" option for optional layers
    if (allowNone) {
      options.push(
        <div 
          key={`${type}-none`}
          className={`relative w-20 h-20 border-2 rounded-md overflow-hidden cursor-pointer ${
            currentValue === 0 
              ? 'border-primary bg-primary/10' 
              : 'border-border hover:border-primary/50'
          }`}
          onClick={() => handleSelectLayer(type, 0)}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-medium">None</span>
          </div>
        </div>
      );
    }
    
    // Generate actual options
    for (let i = 1; i <= count; i++) {
      options.push(
        <div 
          key={`${type}-${i}`}
          className={`relative w-20 h-20 border-2 rounded-md overflow-hidden cursor-pointer ${
            currentValue === i 
              ? 'border-primary bg-primary/10' 
              : 'border-border hover:border-primary/50'
          }`}
          onClick={() => handleSelectLayer(type, i)}
        >
          <div className="bg-white">
            <Image 
              src={`/face-layers/${type}/${i}.png`}
              alt={`${type} ${i}`}
              width={80}
              height={80}
              className="object-contain"
            />
          </div>
        </div>
      );
    }
    
    return options;
  };
  
  // Create a preview user object for the CustomAvatar component
  const previewUser = getPreviewUser();
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Customize Your Avatar</DialogTitle>
          <DialogDescription>
            Select different facial features to create your custom avatar
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-4 h-full overflow-hidden h-[340px]">
          {/* Preview Column */}
          <div className="flex flex-col items-start h-full overflow-y-auto pr-2">
            <h3 className="text-lg font-medium mb-4">Preview</h3>
            <div className="flex flex-col gap-6 items-center">
              <CustomAvatar 
                user={previewUser} 
                size="xl" 
                className="border-4 border-primary/20 shadow-lg" 
                key={`avatar-preview-${skinTone}-${eyes}-${brows}-${mouth}-${nose}-${hair}-${eyewear}-${accessory}`}
              />
              
              <div className="flex items-center space-x-2">
                <Switch 
                  id="use-custom-avatar" 
                  checked={useCustomAvatar}
                  onCheckedChange={toggleCustomAvatar}
                />
                <Label htmlFor="use-custom-avatar">Use custom avatar</Label>
              </div>
              
              <div className="flex flex-col gap-3">
                <Button onClick={handleRandomize} variant="outline">
                  Randomize
                </Button>
                <Button 
                  onClick={handleSave} 
                  disabled={isLoading}
                  className="bg-primary hover:bg-primary/90"
                >
                  {isLoading ? "Saving..." : "Save Avatar"}
                </Button>
              </div>
            </div>
          </div>
          
          {/* Options Column */}
          <div className="md:col-span-2 h-full overflow-hidden">
            <Tabs defaultValue="skintone" className="h-full flex flex-col">
              <TabsList className="mb-4 w-full grid grid-cols-4 md:flex">
                <TabsTrigger value="skintone">Skin</TabsTrigger>
                <TabsTrigger value="eyes">Eyes</TabsTrigger>
                <TabsTrigger value="brows">Brows</TabsTrigger>
                <TabsTrigger value="nose">Nose</TabsTrigger>
                <TabsTrigger value="mouth">Mouth</TabsTrigger>
                <TabsTrigger value="hair">Hair</TabsTrigger>
                <TabsTrigger value="eyewear">Eyewear</TabsTrigger>
                <TabsTrigger value="accessory">Accessory</TabsTrigger>
              </TabsList>
              
              <TabsContent value="skintone" className="mt-0 flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto pr-2 custom-scrollbar">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pb-4">
                    {renderLayerOptions('skintone', layerCounts.skintone)}
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="eyes" className="mt-0 flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto pr-2 custom-scrollbar">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pb-4">
                    {renderLayerOptions('eyes', layerCounts.eyes)}
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="brows" className="mt-0 flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto pr-2 custom-scrollbar">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pb-4">
                    {renderLayerOptions('brows', layerCounts.brows)}
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="nose" className="mt-0 flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto pr-2 custom-scrollbar">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pb-4">
                    {renderLayerOptions('nose', layerCounts.nose)}
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="mouth" className="mt-0 flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto pr-2 custom-scrollbar">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pb-4">
                    {renderLayerOptions('mouth', layerCounts.mouth)}
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="hair" className="mt-0 flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto pr-2 custom-scrollbar">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pb-4">
                    {renderLayerOptions('hair', layerCounts.hair)}
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="eyewear" className="mt-0 flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto pr-2 custom-scrollbar">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pb-4">
                    {renderLayerOptions('eyewear', layerCounts.eyewear, true)}
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="accessory" className="mt-0 flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto pr-2 custom-scrollbar">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pb-4">
                    {renderLayerOptions('accessory', layerCounts.accessory, true)}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 