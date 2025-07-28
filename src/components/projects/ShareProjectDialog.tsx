"use client";

import { useState } from 'react';
import { Copy, Mail, Users, Link2, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

interface ShareProjectDialogProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
}

export default function ShareProjectDialog({ project, isOpen, onClose }: ShareProjectDialogProps) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState('view');
  const [isInviting, setIsInviting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  
  // Mock shared users - in real app this would come from API
  const [sharedUsers] = useState([
    { id: '1', name: 'John Doe', email: 'john@example.com', permission: 'edit', avatar: null },
    { id: '2', name: 'Jane Smith', email: 'jane@example.com', permission: 'view', avatar: null },
  ]);

  const projectUrl = `${window.location.origin}/projects/${project.id}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(projectUrl);
      setCopiedLink(true);
      toast({
        title: "Link copied",
        description: "Project link has been copied to clipboard"
      });
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to copy link",
        variant: "destructive"
      });
    }
  };

  const handleInviteUser = async () => {
    if (!email.trim()) {
      toast({
        title: "Error",
        description: "Please enter an email address",
        variant: "destructive"
      });
      return;
    }

    setIsInviting(true);
    try {
      // TODO: Implement API call to invite user
      await new Promise(resolve => setTimeout(resolve, 1000)); // Mock API call
      
      toast({
        title: "Invitation sent",
        description: `Invitation sent to ${email}`
      });
      
      setEmail('');
      setPermission('view');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send invitation",
        variant: "destructive"
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    try {
      // TODO: Implement API call to remove user
      toast({
        title: "User removed",
        description: "User access has been revoked"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove user",
        variant: "destructive"
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Share "{project.name}"
          </DialogTitle>
          <DialogDescription>
            Invite others to collaborate on this project
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="invite" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="invite">Invite People</TabsTrigger>
            <TabsTrigger value="link">Share Link</TabsTrigger>
          </TabsList>

          <TabsContent value="invite" className="space-y-4">
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleInviteUser()}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Permission</Label>
                  <Select value={permission} onValueChange={setPermission}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="view">View</SelectItem>
                      <SelectItem value="edit">Edit</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <Button 
                onClick={handleInviteUser} 
                disabled={isInviting || !email.trim()}
                className="w-full"
              >
                <Mail className="mr-2 h-4 w-4" />
                {isInviting ? 'Sending...' : 'Send Invitation'}
              </Button>
            </div>

            {sharedUsers.length > 0 && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">People with access</Label>
                <div className="space-y-2">
                  {sharedUsers.map((user) => (
                    <div key={user.id} className="flex items-center justify-between p-2 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {user.permission}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveUser(user.id)}
                          className="h-8 w-8 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="link" className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Project link</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Anyone with this link can view the project
                </p>
                <div className="flex gap-2">
                  <Input
                    value={projectUrl}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    onClick={handleCopyLink}
                    className="flex-shrink-0"
                  >
                    {copiedLink ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-start gap-3">
                  <Link2 className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Public link sharing</p>
                    <p className="text-xs text-muted-foreground">
                      Anyone with this link can view project details, tasks, and progress. 
                      They won't be able to edit or create content.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}