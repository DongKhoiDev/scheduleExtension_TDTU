# Extension Xuất Lịch Học TDTU

Extension Chrome đơn giản để xuất lịch học từ trang web TDTU sang file .ics để import vào Google Calendar.

## Cách sử dụng

1. Mở trang lịch học TDTU
2. Click vào icon extension
3. Chọn ngày bắt đầu của tuần đầu tiên (Thứ 2) của học kỳ
4. Nhấn nút "Xuất lịch học (.ics)"
5. File `tkb.ics` sẽ được tải về, import vào Google Calendar

## Cài đặt

1. Mở Chrome Extensions (chrome://extensions/)
2. Bật "Developer mode"
3. Click "Load unpacked" và chọn thư mục chứa extension
4. Extension sẽ xuất hiện trong thanh công cụ

## Lưu ý

- Chọn đúng ngày Thứ 2 của tuần đầu tiên trong học kỳ để lịch hiển thị chính xác
- VD: Ngày bắt đầu kỳ 2 là 29/12/2025
- Extension tự động lưu ngày bắt đầu đã chọn

## Files

- `manifest.json`: Cấu hình extension
- `popup.html/js`: Giao diện popup
- `content.js`: Script parse lịch học và tạo file .ics
- `icon48.png`: Icon của extension
