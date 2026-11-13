// Mô hình nhân vật và nhạc nặng (~60 MB) được phát từ GitHub Pages (miễn phí, không tính băng thông Render).
// Nếu GitHub Pages lỗi thì tự quay về tải từ máy chủ game như cũ.
export const CDN = 'https://tienphan1412-sudo.github.io/mong-phuong-hoang/assets/';
let cdnOk = true;
export function asset(path) { return (cdnOk ? CDN : '') + path; }
export function cdnFail(path) { if (cdnOk) { cdnOk = false; console.warn('CDN lỗi, chuyển về tải từ máy chủ:', path); } return path; }
export function usingCdn() { return cdnOk; }
