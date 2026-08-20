CREATE TABLE `x_oauth_credentials` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`username` text NOT NULL,
	`encrypted_access_token` text NOT NULL,
	`encrypted_refresh_token` text NOT NULL,
	`token_type` text DEFAULT 'bearer' NOT NULL,
	`scope` text NOT NULL,
	`access_token_expires_at` integer NOT NULL,
	`connected_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
