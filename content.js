// Thời gian các tiết học
const PERIODS = {
    1: { start: '06:50', end: '07:40' },
    2: { start: '07:40', end: '08:30' },
    3: { start: '08:30', end: '09:20' },
    4: { start: '09:30', end: '10:20' },
    5: { start: '10:20', end: '11:10' },
    6: { start: '11:10', end: '12:00' },
    7: { start: '12:45', end: '13:35' },
    8: { start: '13:35', end: '14:25' },
    9: { start: '14:25', end: '15:15' },
    10: { start: '15:25', end: '16:15' },
    11: { start: '16:15', end: '17:05' },
    12: { start: '17:05', end: '17:55' },
    13: { start: '18:05', end: '18:55' },
    14: { start: '18:55', end: '19:45' },
    15: { start: '19:45', end: '20:35' }
};

// Giả định ngày bắt đầu tuần 1 (sẽ được truyền từ popup)
let SEMESTER_START = new Date('2024-08-11'); // Thứ 2 tuần 1 - mặc định

// Lắng nghe message từ popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'exportSchedule') {
        try {
            // Cập nhật ngày bắt đầu học kỳ từ user input
            if (request.semesterStart) {
                // Parse ngày với timezone local để tránh lệch
                const [year, month, day] = request.semesterStart.split('-');
                SEMESTER_START = new Date(year, month - 1, day);
            }

            const icsContent = parseScheduleToICS();
            const eventCount = (icsContent.match(/BEGIN:VEVENT/g) || []).length;
            sendResponse({
                success: true,
                icsContent: icsContent,
                eventCount: eventCount
            });
        } catch (error) {
            sendResponse({
                success: false,
                error: error.message
            });
        }
    }
    return true;
});

function parseScheduleToICS() {
    const events = [];

    // Tìm tất cả các ô trong bảng thời khóa biểu
    const cells = document.querySelectorAll('td[id*="ThoiKhoaBieu1_row"]');

    cells.forEach((cell, index) => {
        const spans = cell.querySelectorAll('span');

        spans.forEach(span => {
            const text = span.innerText || span.textContent;
            if (!text || text.trim() === '') return;

            // Parse thông tin môn học
            const courseInfo = parseCourseInfo(text);
            if (!courseInfo) return;

            // Xác định thứ trong tuần dựa trên vị trí cột
            const dayOfWeek = getDayOfWeekFromCell(cell);
            if (dayOfWeek === -1) return;



            // Tạo events cho từng tuần học
            const weekEvents = createEventsForWeeks(courseInfo, dayOfWeek);
            events.push(...weekEvents);
        });
    });

    return generateICS(events);
}

function parseCourseInfo(text) {
    try {
        // Loại bỏ các ký tự đặc biệt và normalize text
        const cleanText = text.replace(/\|/g, '\n').replace(/\s+/g, ' ').trim();
        const lines = cleanText.split('\n').map(line => line.trim()).filter(line => line);

        // Thử tìm trực tiếp từ text gốc cũng nếu việc split không hiệu quả
        const originalText = text.trim();

        let courseName = '';
        let courseCode = '';
        let periods = '';
        let room = '';
        let group = '';
        let team = '';
        let weekPattern = '';

        // Thử parse trực tiếp từ text gốc trước
        // Kiểm tra nếu phòng để trống như "(Phòng:|Room: )"
        const emptyRoomMatch = originalText.match(/\(.*?(?:Phòng|Room)[\s\|]*:\s*\)/i);
        if (emptyRoomMatch) {
            room = ''; // Phòng trống
        } else {
            // Cải thiện regex để bắt được tên phòng - tách riêng hai trường hợp
            let directRoomMatch = originalText.match(/Phòng[\s\|]*:\s*([A-Z0-9_][A-Z0-9\-\.\/\_]*)/i);
            if (!directRoomMatch) {
                directRoomMatch = originalText.match(/Room:\s*([A-Z0-9_][A-Z0-9\-\.\/\_]*)/i);
            }
            if (!directRoomMatch) {
                directRoomMatch = originalText.match(/(?:Phòng|Room)[\s\|]*:\s*([^,\n\r\)\s]+)/i);
            }
            
            if (directRoomMatch && directRoomMatch[1] && directRoomMatch[1].trim() !== '') {
                room = directRoomMatch[1].trim();
            }
        }

        const directPeriodMatch = originalText.match(/(?:Tiết|Period)[\s:]*([0-9]+)/i);
        if (directPeriodMatch) {
            periods = directPeriodMatch[1];
        }

        const directWeekMatch = originalText.match(/(?:Tuần học|Week)[\s:]*([0-9\-]+)/i);
        if (directWeekMatch) {
            weekPattern = directWeekMatch[1];
        }

        // Thêm parsing trực tiếp cho nhóm và tổ
        const directGroupMatch = originalText.match(/(?:Nhóm|Group)[\s\|]*:\s*(\d+)/i);
        if (directGroupMatch) {
            group = directGroupMatch[1];
        }

        const directTeamMatch = originalText.match(/(?:Tổ|Sub-group)[\s\|]*:\s*(\d+)/i);
        if (directTeamMatch) {
            team = directTeamMatch[1];
        }

        // Debug: Log toàn bộ text để kiểm tra
        console.log('Full text:', cleanText);
        console.log('Original text:', originalText);
        console.log('Room from direct parsing:', room);
        // console.log('Lines:', lines);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Debug: Log từng dòng để kiểm tra
            // console.log(`Line ${i}: "${line}"`);

            // Tên môn học (dòng đầu tiên thường là tên môn)
            if (i === 0 && !courseName) {
                // Tách tên tiếng Việt từ chuỗi dài (bỏ phần tiếng Anh)
                let cleanCourseName = line;

                // Loại bỏ phần tiếng Anh (thường sau dấu gạch ngang hoặc trước dấu ngoặc)
                if (cleanCourseName.includes(' - ')) {
                    cleanCourseName = cleanCourseName.split(' - ')[0];
                }

                // Loại bỏ phần trong ngoặc đơn nếu có
                if (cleanCourseName.includes('(')) {
                    cleanCourseName = cleanCourseName.split('(')[0];
                }

                // Loại bỏ khoảng trắng thừa
                courseName = cleanCourseName.trim();
            }

            // Mã môn học - tìm pattern (XXXXX - Nhóm) và parse cả nhóm và tổ từ cùng dòng
            if (line.includes('Nhóm') || line.includes('Group') || line.includes('Tổ') || line.includes('Sub-group')) {
                // Parse mã môn học
                const codeMatch = line.match(/\(([A-Z0-9]+)\s*-/);
                if (codeMatch) {
                    courseCode = codeMatch[1];
                }
                
                // Lấy thông tin nhóm - chỉ parse nếu chưa có từ direct parsing
                if (!group) {
                    const groupMatch = line.match(/(?:Nhóm|Group)[\s\|]*:\s*(\d+)/i);
                    if (groupMatch) {
                        group = groupMatch[1];
                    }
                }
                
                // Lấy thông tin tổ - chỉ parse nếu chưa có từ direct parsing
                if (!team) {
                    const teamMatch = line.match(/(?:Tổ|Sub-group)[\s\|]*:\s*(\d+)/i);
                    if (teamMatch) {
                        team = teamMatch[1];
                    }
                }
            }

            // Tiết học - chỉ parse nếu chưa có từ direct parsing
            if (!periods && (line.includes('Tiết') || line.includes('Period:'))) {
                // Tìm từ "Tiết" hoặc "Period:" và lấy tất cả số theo sau
                const periodMatch = 
                    line.match(/(?:Tiết|Period:)\s*([0-9]+)/i) ||
                    line.match(/(?:Tiết|Period)\s*([0-9]+)/i);
                if (periodMatch) {
                    periods = periodMatch[1];
                }
            }

            // Phòng học - chỉ parse nếu chưa có từ direct parsing
            if (!room && (line.includes('Phòng') || line.includes('Room'))) {
                // Thử nhiều pattern khác nhau cho format "Phòng:|Room: HT_6B"
                let roomMatch = 
                    line.match(/(?:Phòng|Room)[\s\|]*:\s*([A-Z0-9_][A-Z0-9\-\.\/\_]*)/i) ||
                    line.match(/(?:Phòng|Room)[\s\|]*:\s*([^,\n\r\)\s]+)/i) ||
                    line.match(/(?:Phòng|Room)[\s:]*([A-Z0-9_][A-Z0-9\-\.\/\_\s]*)/i);
                
                if (roomMatch) {
                    let roomValue = roomMatch[1].trim();
                    // Loại bỏ các ký tự không mong muốn
                    roomValue = roomValue.replace(/[,;].*$/, '').trim();
                    
                    // Chỉ gán nếu có giá trị thực và không phải chỉ là khoảng trắng hoặc dấu ngoặc đóng
                    if (roomValue && roomValue !== '' && roomValue !== ')' && roomValue.length > 0) {
                        room = roomValue;
                    }
                }
            }

            // Tuần học - chỉ parse nếu chưa có từ direct parsing
            if (!weekPattern && (line.includes('Tuần học') || line.includes('Week:'))) {
                const weekMatch = line.match(/(?:Tuần học|Week:)\s*([0-9\-]+)/);
                if (weekMatch) {
                    weekPattern = weekMatch[1];
                }
            }
        }

        // Nếu không tìm được tên môn từ dòng đầu, tìm từ các dòng khác
        if (!courseName) {
            for (let line of lines) {
                if (!line.includes('Nhóm') && !line.includes('Tiết') && !line.includes('Tuần') &&
                    !line.includes('Group') && !line.includes('Period') && !line.includes('Week')) {
                    // Tách tên tiếng Việt từ chuỗi dài
                    let cleanCourseName = line;

                    if (cleanCourseName.includes(' - ')) {
                        cleanCourseName = cleanCourseName.split(' - ')[0];
                    }

                    if (cleanCourseName.includes('(')) {
                        cleanCourseName = cleanCourseName.split('(')[0];
                    }

                    courseName = cleanCourseName.trim();
                    break;
                }
            }
        }


        if (!courseName || !periods || !weekPattern) {
            // console.log('Missing required info:', { courseName, periods, weekPattern });
            return null;
        }

        const result = {
            courseName,
            courseCode,
            periods,
            room: room || '', // Đảm bảo không bị undefined
            group,
            team,
            weekPattern
        };
        
        // Debug: Log kết quả parse
        console.log('Parsed course info:', result);
        
        return result;
    } catch (error) {
        console.error('Error parsing course info:', error, text);
        return null;
    }
}

function getDayOfWeekFromCell(cell) {
    // Lấy ID của cell để xác định cột
    const id = cell.id;
    const match = id.match(/col(\d+)/);
    if (!match) return -1;

    const col = parseInt(match[1]);

    // Thử mapping khác: có thể col1 = Thứ 2, col2 = Thứ 3, ...
    // Hoặc col0 = Chủ nhật, col1 = Thứ 2, col2 = Thứ 3, ...
    let dayOfWeek;

    if (col === 0) {
        dayOfWeek = 7; // Chủ nhật
    } else {
        dayOfWeek = col; // col1=1(Thứ2), col2=2(Thứ3), ..., col6=6(Thứ7)
    }


    return dayOfWeek;
}

function createEventsForWeeks(courseInfo, dayOfWeek) {
    const events = [];
    const { courseName, courseCode, periods, room, group, team, weekPattern } = courseInfo;

    // Parse các tiết học - FIX: Xử lý đúng chuỗi tiết
    const periodNumbers = [];

    // Hàm thông minh để parse chuỗi tiết
    function parsePeriodString(periods) {
        const result = [];

        // Các trường hợp đặc biệt với tiết 2 chữ số
        const specialCases = {
            "123": [1, 2, 3],
            "456": [4, 5, 6],
            "789": [7, 8, 9],
            "101112": [10, 11, 12],
            "131415": [13, 14, 15],
            "12345": [1, 2, 3, 4, 5],
            "23456": [2, 3, 4, 5, 6],
            "7891011": [7, 8, 9, 10, 11],
            "89101112": [8, 9, 10, 11, 12]
        };

        if (specialCases[periods]) {
            return specialCases[periods];
        }

        // Parse thông minh cho các trường hợp khác
        let i = 0;
        while (i < periods.length) {
            // Thử parse 2 ký tự trước (cho tiết 10-15)
            if (i + 1 < periods.length) {
                const twoDigit = periods.substring(i, i + 2);
                const twoDigitNum = parseInt(twoDigit);

                // Nếu là tiết 10-15 và hợp lệ
                if (twoDigitNum >= 10 && twoDigitNum <= 15) {
                    result.push(twoDigitNum);
                    i += 2;
                    continue;
                }
            }

            // Parse 1 ký tự (tiết 1-9)
            const oneDigit = parseInt(periods[i]);
            if (oneDigit >= 1 && oneDigit <= 9) {
                result.push(oneDigit);
            }
            i += 1;
        }

        return result;
    }

    const parsedPeriods = parsePeriodString(periods);
    periodNumbers.push(...parsedPeriods);


    if (periodNumbers.length === 0) return events;

    const startPeriod = Math.min(...periodNumbers);
    const endPeriod = Math.max(...periodNumbers);

    const startTime = PERIODS[startPeriod]?.start;
    const endTime = PERIODS[endPeriod]?.end;

    if (!startTime || !endTime) {
        console.error(`Invalid periods: ${startPeriod}-${endPeriod}`, PERIODS[startPeriod], PERIODS[endPeriod]);
        return events;
    }


    // Parse chuỗi tuần học

    for (let i = 0; i < weekPattern.length; i++) {
        const char = weekPattern[i];
        if (char !== '-') {
            // Có học ở tuần này
            const weekNumber = i + 1;
            const eventDate = getDateForWeek(weekNumber, dayOfWeek);


            if (eventDate) {
                // Tạo datetime object với timezone local để tránh lệch
                const [year, month, day] = eventDate.split('-');
                const [startHour, startMinute] = startTime.split(':');
                const [endHour, endMinute] = endTime.split(':');

                const startDateTime = new Date(year, month - 1, day, startHour, startMinute);
                const endDateTime = new Date(year, month - 1, day, endHour, endMinute);

                // Tạo description với đầy đủ thông tin
                let description = `Mã môn: ${courseCode}`;
                if (group) description += `\\nNhóm: ${group}`;
                if (team) description += `\\nTổ: ${team}`;
                if (room && room.trim()) {
                    description += `\\nPhòng: ${room}`;
                } else {
                    description += `\\nPhòng: Chưa xác định`;
                }
                description += `\\nTiết: ${periods}`;

                events.push({
                    title: courseName,
                    description: description,
                    location: room || 'Chưa xác định',
                    startDateTime: startDateTime,
                    endDateTime: endDateTime
                });
            }
        }
    }

    return events;
}

function getDateForWeek(weekNumber, dayOfWeek) {
    // Tính ngày cụ thể dựa trên tuần và thứ
    // dayOfWeek: 1=Thứ2, 2=Thứ3, ..., 7=CN
    // SEMESTER_START là ngày Thứ 2 của tuần 1

    const date = new Date(SEMESTER_START);
    // Đảm bảo không bị lệch timezone bằng cách làm việc với local date
    date.setHours(0, 0, 0, 0); // Reset time để tránh lệch timezone

    // Thêm số ngày = (weekNumber-1)*7 + (dayOfWeek-1)
    date.setDate(date.getDate() + (weekNumber - 1) * 7 + (dayOfWeek - 1));

    // Format lại để đảm bảo không bị lệch timezone
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function generateICS(events) {
    let ics = 'BEGIN:VCALENDAR\n';
    ics += 'VERSION:2.0\n';
    ics += 'PRODID:-//TDTU Schedule Exporter//EN\n';
    ics += 'CALSCALE:GREGORIAN\n';

    events.forEach(event => {
        ics += 'BEGIN:VEVENT\n';
        ics += `UID:${generateUID()}\n`;
        ics += `DTSTART:${formatDateTime(event.startDateTime)}\n`;
        ics += `DTEND:${formatDateTime(event.endDateTime)}\n`;
        ics += `SUMMARY:${event.title}\n`;
        ics += `DESCRIPTION:${event.description}\n`;
        ics += `LOCATION:${event.location}\n`;
        ics += 'END:VEVENT\n';
    });

    ics += 'END:VCALENDAR\n';
    return ics;
}

function formatDateTime(date) {
    // Format datetime cho ICS với timezone local, không UTC
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}T${hour}${minute}${second}`;
}

function generateUID() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
