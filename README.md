# Thời tiết Việt Nam

Ứng dụng web tĩnh tiếng Việt theo dõi thời tiết tham khảo, bão và cảnh báo thiên tai. Frontend chỉ đọc `data/weather.json`; GitHub Actions cập nhật dữ liệu định kỳ, không cần backend chạy liên tục.

## Triển khai GitHub Pages

1. Đưa các tệp này vào nhánh mặc định của repository.
2. Vào **Settings → Pages**, chọn **Deploy from a branch**, chọn nhánh mặc định và thư mục **/(root)**.
3. Vào **Settings → Actions → General → Workflow permissions**, bật quyền ghi nội dung repository (read and write permissions). Workflow cần `contents: write` để commit JSON.
4. Trong **Actions**, chạy **Update weather data → Run workflow** lần đầu; sau đó lịch chạy tự động mỗi 5 phút.
5. Mở URL GitHub Pages sau khi Pages deploy xong. Chạy local bằng `python -m http.server 8000`, rồi mở `http://localhost:8000`.

Lịch chỉ hoạt động sau khi workflow được đưa lên nhánh mặc định. GitHub có thể trì hoãn lịch chạy khi tải cao; mỗi 5 phút là lịch yêu cầu, không phải cam kết thời gian thực. JSON được commit vào nhánh mặc định để Pages phục vụ tĩnh.

## Nguồn và phạm vi

- MVP lấy thời tiết cho 10 điểm theo dõi từ Open-Meteo.
- Open-Meteo là nguồn **tham khảo, không phải nguồn chính thức Việt Nam**. Giữ attribution theo điều kiện của nhà cung cấp.
- Bão và cảnh báo thiên tai chưa tự động nạp. Hai danh sách để trống đến khi có API/feed chính thức và quyền khai thác được xác minh; ứng dụng không tự suy diễn cảnh báo.
- Khi lấy dữ liệu lỗi, tác vụ giữ dữ liệu thành công gần nhất và đánh dấu `stale`; frontend hiển thị cảnh báo và thời điểm dữ liệu.
- Khi có nguồn Việt Nam được cấp phép, thay adapter trong `scripts/update_data.py`, giữ schema JSON để không cần viết lại giao diện.
