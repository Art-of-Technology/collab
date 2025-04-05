"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import { User } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useUpdateUserProfile } from "@/hooks/queries/useUser";

interface EditProfileFormProps {
  user: Partial<User>;
  onCancel: () => void;
}

export default function EditProfileForm({ user, onCancel }: EditProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(user.name || "");
  const [team, setTeam] = useState(user.team || "");
  const [currentFocus, setCurrentFocus] = useState(user.currentFocus || "");
  const [expertiseInput, setExpertiseInput] = useState("");
  const [expertise, setExpertise] = useState<string[]>(user.expertise || []);
  
  // Use TanStack Query mutation
  const updateProfileMutation = useUpdateUserProfile();
  const isLoading = updateProfileMutation.isPending;
  
  const handleAddExpertise = () => {
    if (!expertiseInput.trim()) return;
    
    if (!expertise.includes(expertiseInput.trim())) {
      setExpertise([...expertise, expertiseInput.trim()]);
    }
    
    setExpertiseInput("");
  };
  
  const handleRemoveExpertise = (skill: string) => {
    setExpertise(expertise.filter(item => item !== skill));
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await updateProfileMutation.mutateAsync({
        name,
        team,
        currentFocus,
        expertise,
      });
      
      toast.success("Profile updated successfully");
      router.refresh();
      onCancel();
    } catch (error) {
      toast.error("Something went wrong");
      console.error(error);
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label 
          htmlFor="name" 
          className="block text-sm font-medium text-gray-700"
        >
          Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          placeholder="Your name"
        />
      </div>
      
      <div>
        <label 
          htmlFor="team" 
          className="block text-sm font-medium text-gray-700"
        >
          Team
        </label>
        <input
          id="team"
          type="text"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          placeholder="Your team (e.g. Frontend, Backend, DevOps)"
        />
      </div>
      
      <div>
        <label 
          htmlFor="currentFocus" 
          className="block text-sm font-medium text-gray-700"
        >
          Current Focus
        </label>
        <textarea
          id="currentFocus"
          value={currentFocus}
          onChange={(e) => setCurrentFocus(e.target.value)}
          rows={3}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          placeholder="What are you currently working on?"
        />
      </div>
      
      <div>
        <label 
          htmlFor="expertise" 
          className="block text-sm font-medium text-gray-700"
        >
          Expertise
        </label>
        <div className="flex">
          <input
            id="expertise"
            type="text"
            value={expertiseInput}
            onChange={(e) => setExpertiseInput(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="Add a skill (e.g. React, Node.js, AWS)"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddExpertise();
              }
            }}
          />
          <button
            type="button"
            onClick={handleAddExpertise}
            className="ml-2 mt-1 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Add
          </button>
        </div>
        {expertise.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {expertise.map((skill, index) => (
              <div
                key={index}
                className="bg-gray-100 px-3 py-1 rounded-full text-sm flex items-center"
              >
                <span>{skill}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveExpertise(skill)}
                  className="ml-1.5 text-gray-400 hover:text-gray-600"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {isLoading ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
} 