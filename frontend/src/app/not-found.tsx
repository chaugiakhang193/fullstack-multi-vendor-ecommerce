import NotFoundView from '@/components/shared/not-found-view';

// Root not-found: bắt mọi URL không khớp route nào (trước đây rơi vào trang 404
// mặc định của Next "404: This page could not be found."). Dùng chung giao diện brand.
// fullScreen: không có header/footer bao quanh → căn giữa toàn màn hình.
export default function NotFound() {
  return <NotFoundView fullScreen />;
}
