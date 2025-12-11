document.addEventListener('DOMContentLoaded', function() {
    const exportBtn = document.getElementById('exportBtn');
    const status = document.getElementById('status');
    const semesterStartInput = document.getElementById('semesterStart');
    
    // Helper functions để chuyển đổi định dạng ngày
    function formatDateToDisplay(dateString) {
        // Chuyển từ yyyy-mm-dd sang dd/mm/yyyy
        if (!dateString) return '';
        const [year, month, day] = dateString.split('-');
        return `${day}/${month}/${year}`;
    }
    
    function formatDateToStore(displayDate) {
        // Chuyển từ dd/mm/yyyy sang yyyy-mm-dd
        if (!displayDate) return '';
        const [day, month, year] = displayDate.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    function validateDateFormat(dateString) {
        // Kiểm tra định dạng dd/mm/yyyy
        const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
        const match = dateString.match(regex);
        if (!match) return false;
        
        const [, day, month, year] = match;
        const date = new Date(year, month - 1, day);
        return date.getDate() == day && date.getMonth() == month - 1 && date.getFullYear() == year;
    }
    
    // Set default date to a reasonable semester start (first Monday of academic year)
    const now = new Date();
    const currentYear = now.getFullYear();
    const defaultStart = new Date(currentYear, 7, 12); // August 12 as default
    const defaultDateString = `${currentYear}-12-29`;
    semesterStartInput.value = formatDateToDisplay(defaultDateString);
    
    // Load saved date if exists
    chrome.storage.local.get(['semesterStart'], function(result) {
        if (result.semesterStart) {
            semesterStartInput.value = formatDateToDisplay(result.semesterStart);
        }
    });
    
    // Save date when changed
    semesterStartInput.addEventListener('change', function() {
        const displayDate = semesterStartInput.value;
        if (validateDateFormat(displayDate)) {
            const storeDate = formatDateToStore(displayDate);
            chrome.storage.local.set({
                semesterStart: storeDate
            });
            semesterStartInput.style.borderColor = '#ddd'; // Reset border color
        } else {
            semesterStartInput.style.borderColor = '#ff0000'; // Red border for invalid format
        }
    });
    
    exportBtn.addEventListener('click', async function() {
        exportBtn.disabled = true;
        exportBtn.textContent = 'Đang xử lý...';
        status.textContent = '';
        
        try {
            // Validate input format first
            if (!validateDateFormat(semesterStartInput.value)) {
                throw new Error('Vui lòng nhập ngày theo định dạng dd/mm/yyyy (ví dụ: 29/12/2025)');
            }
            
            // Lấy tab hiện tại
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            
            // Kiểm tra xem có phải trang lịch học không
            if (!tab.url.includes('lichhoc-lichthi.tdtu.edu.vn')) {
                throw new Error('Vui lòng mở trang lịch học TỔNG QUÁT trước');
            }
            
            // Convert to storage format before sending
            const semesterStartFormatted = formatDateToStore(semesterStartInput.value);
            
            // Gửi message đến content script
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'exportSchedule',
                semesterStart: semesterStartFormatted
            });
            
            if (response.success) {
                // Tạo file .ics và download
                const blob = new Blob([response.icsContent], {type: 'text/calendar'});
                const url = URL.createObjectURL(blob);
                
                await chrome.downloads.download({
                    url: url,
                    filename: 'tkb.ics'
                });
                
                status.textContent = `Đã xuất thành công ${response.eventCount} sự kiện!`;
            } else {
                throw new Error(response.error || 'Có lỗi xảy ra');
            }
            
        } catch (error) {
            status.textContent = 'Lỗi: ' + error.message;
            status.style.color = '#cc0000';
        } finally {
            exportBtn.disabled = false;
            exportBtn.textContent = 'Xuất lịch học (.ics)';
        }
    });
    
    // Event listener cho nút mở Google Calendar
    const openCalendarBtn = document.getElementById('openCalendarBtn');
    openCalendarBtn.addEventListener('click', function() {
        // Mở Google Calendar trong tab mới và hiển thị hướng dẫn
        chrome.tabs.create({ url: 'https://calendar.google.com/calendar/u/0/r/settings/export' });
        
        // Hiển thị hướng dẫn import
        status.innerHTML = `
            <strong style="color: #34a853;">📅 Hướng dẫn import vào Google Calendar:</strong><br>
            1. Nhấn nút "Xuất lịch học" để tải file tkb.ics<br>
            2. Vào Google Calendar → ⚙️ Settings → Import & Export<br>
            3. Chọn "Import" → Chọn file tkb.ics đã tải<br>
            4. Hoàn thành! 🎉
        `;
        status.style.color = '#34a853';
    });
});
