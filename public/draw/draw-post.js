/**
 * Post to Tchoff - upload drawn canvas directly to the feed.
 * Requires hash-util.js (hashImageAtSize, computeBabelia) and getDrawMergedBlob from stickers.js
 */
(function () {
  const API = '/api';

  document.getElementById('post-to-tchoff-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('post-to-tchoff-btn');
    const authToken = localStorage.getItem('tchoff_token');
    if (!authToken) {
      window.location.href = '/#auth';
      return;
    }

    if (typeof getDrawMergedBlob !== 'function') {
      alert('Canvas not ready. Try again.');
      return;
    }
    if (typeof hashImageAtSize !== 'function' || typeof computeBabelia !== 'function') {
      alert('Hash utilities not loaded. Refresh the page.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Computing…';
    try {
      const blob = await getDrawMergedBlob(1);
      if (!blob) throw new Error('Could not export canvas');
      const file = new File([blob], 'drawing.png', { type: 'image/png' });

      btn.textContent = 'Computing hash…';
      const [imageHash, babelia] = await Promise.all([
        hashImageAtSize(file),
        computeBabelia(file),
      ]);
      const { babelHash, pngBlob, width: babelW, height: babelH } = babelia;

      btn.textContent = 'Uploading…';
      const pngBase64 = await new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result?.split(',')[1] || null);
        r.readAsDataURL(pngBlob);
      });

      const caption = (document.getElementById('draw-caption')?.value || '').trim();
      const form = new FormData();
      form.append('image', file);
      form.append('imageHash', imageHash);
      form.append('babelHash', babelHash);
      form.append('babeliaPng', pngBase64 || 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
      form.append('width', String(babelW || ''));
      form.append('height', String(babelH || ''));
      form.append('caption', caption);
      form.append('username', 'anonymous');
      form.append('visibility', 'public');

      const res = await fetch(`${API}/upload`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + authToken },
        body: form,
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        window.location.href = '/#auth';
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || res.statusText || 'Upload failed');
      }
      if (data.success) {
        const url = data.urlNum || (data.num ? `/i/n/${data.num}` : '/');
        window.location.href = url;
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (err) {
      alert(err.message || 'Post failed');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Post to Tchoff';
    }
  });
})();
