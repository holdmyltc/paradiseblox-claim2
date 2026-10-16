-- Only allow PNG and JPEG screenshots (max 8 MB) in storage.
-- Run this AFTER the new site is live, because the old site still allows other file types.
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg'],
    file_size_limit = 8388608
where id in ('chat-attachments', 'delivery-proofs');
