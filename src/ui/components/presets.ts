// A small built-in collection of curated lists. Picked to be useful day-1
// without overpromising. Users can edit them after adding.

export interface Preset {
  id: string;
  name: string;
  sites: string[];
}

export const PRESETS: Preset[] = [
  {
    id: 'social',
    name: 'Social',
    sites: ['facebook.com', 'instagram.com', 'x.com', 'tiktok.com', 'snapchat.com', 'threads.net'],
  },
  {
    id: 'video',
    name: 'Video',
    sites: ['youtube.com', 'twitch.tv', 'netflix.com', 'hulu.com'],
  },
  {
    id: 'news-distractions',
    name: 'News & forums',
    sites: ['reddit.com', 'news.ycombinator.com', 'theverge.com', 'cnn.com', 'bbc.com'],
  },
  {
    id: 'shopping',
    name: 'Shopping',
    sites: ['amazon.com', 'aliexpress.com', 'ebay.com', 'etsy.com'],
  },
];
