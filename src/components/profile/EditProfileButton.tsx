"use client";

import { useState } from "react";
import { User } from "@prisma/client";
import { PencilIcon } from "@heroicons/react/24/outline";
import EditProfileForm from "./EditProfileForm";

interface EditProfileButtonProps {
  user: Partial<User>;
}

export default function EditProfileButton({ user }: EditProfileButtonProps) {
  const [isEditing, setIsEditing] = useState(false);
  
  if (isEditing) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
          <h2 className="text-xl font-bold mb-4">Edit Profile</h2>
          <EditProfileForm 
            user={user} 
            onCancel={() => setIsEditing(false)} 
          />
        </div>
      </div>
    );
  }
  
  return (
    <button
      onClick={() => setIsEditing(true)}
      className="flex items-center px-3 py-1.5 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
    >
      <PencilIcon className="h-4 w-4 mr-1" />
      Edit Profile
    </button>
  );
} 