export interface Folder {
  id: number;
  name: string;
  color: string | null;
  bookmark_count?: number;
}

export interface Tag {
  id: number;
  name: string;
  source?: 'manual' | 'auto';
  bookmark_count?: number;
}

export interface QuotedTweet {
  tweet_id: string;
  full_text: string;
  author_name: string;
  author_handle: string;
  author_avatar: string | null;
}

export interface Bookmark {
  id: number;
  tweet_id: string;
  full_text: string;
  author_name: string;
  author_handle: string;
  author_avatar: string | null;
  author_verified: boolean;
  tweet_url: string;
  media_urls: string[];
  quoted_tweet: QuotedTweet | null;
  like_count: number;
  retweet_count: number;
  reply_count: number;
  quote_count: number;
  view_count: number | null;
  bookmark_count: number | null;
  lang: string | null;
  bookmarked_at: number | null;
  folders: Folder[];
  tags: Tag[];
}

export interface BookmarkMeta {
  total: number;
  per_page: number;
  current_page: number;
  last_page: number;
}

export interface BookmarksResponse {
  data: Bookmark[];
  meta: BookmarkMeta;
}

export interface SyncStatus {
  in_progress: boolean;
  last_synced_at: number | null;
  total_bookmarks: number;
  untagged_count: number;
  last_error: string | null;
}
