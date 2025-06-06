-- Update all users to disable custom avatars
UPDATE "User" SET "useCustomAvatar" = false WHERE "useCustomAvatar" = true; 