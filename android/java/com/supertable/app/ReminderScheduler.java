package com.supertable.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

final class ReminderScheduler {

    private static final String PREFS = "supertable_reminders";
    private static final String KEY_DATA = "data";
    private static final String KEY_CODES = "codes";
    private static final String ACTION = "com.supertable.app.CLASS_REMIND";
    private static final DateTimeFormatter HM = DateTimeFormatter.ofPattern("HH:mm");

    static void sync(Context context, String json) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString(KEY_DATA, json).apply();
        schedule(context, json);
    }

    static void reschedule(Context context) {
        String json = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_DATA, "");
        if (json == null || json.isEmpty()) return;
        schedule(context, json);
    }

    private static void schedule(Context context, String json) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        cancelAll(context, am);
        try {
            JSONObject data = new JSONObject(json);
            if (!data.optBoolean("enabled", false)) return;

            int before = data.optInt("before", 15);
            String termText = data.optString("termStart", "");
            if (termText.isEmpty()) return;
            LocalDate termStart = LocalDate.parse(termText);

            JSONArray periods = data.optJSONArray("periods");
            JSONArray courses = data.optJSONArray("courses");
            if (periods == null || courses == null) return;

            LocalTime[] starts = new LocalTime[21];
            for (int i = 0; i < periods.length(); i++) {
                JSONObject p = periods.getJSONObject(i);
                int no = p.optInt("no", i + 1);
                if (no >= 1 && no < starts.length) {
                    starts[no] = parseTime(p.optString("start", ""));
                }
            }

            LocalDate today = LocalDate.now();
            List<Integer> codes = new ArrayList<>();
            for (int offset = 0; offset <= 59; offset++) {
                LocalDate date = today.plusDays(offset);
                long days = ChronoUnit.DAYS.between(termStart, date);
                if (days < 0) continue;
                int week = (int) (days / 7) + 1;
                int weekday = date.getDayOfWeek().getValue();

                for (int i = 0; i < courses.length(); i++) {
                    JSONObject c = courses.getJSONObject(i);
                    if (c.optInt("day", 0) != weekday) continue;
                    if (!hasWeek(c.optJSONArray("weeks"), week)) continue;

                    int startPeriod = c.optInt("start", 0);
                    if (startPeriod <= 0 || startPeriod >= starts.length) continue;
                    LocalTime time = starts[startPeriod];
                    if (time == null) continue;

                    LocalDateTime at = LocalDateTime.of(date, time).minusMinutes(before);
                    if (at.isBefore(LocalDateTime.now())) continue;

                    int code = date.getDayOfYear() * 1000 + (i % 100) * 10 + (startPeriod % 10);
                    Intent intent = new Intent(context, ReminderReceiver.class)
                            .setAction(ACTION + code)
                            .putExtra("title", c.optString("name", "上课提醒"))
                            .putExtra("room", c.optString("room", ""))
                            .putExtra("teacher", c.optString("teacher", ""))
                            .putExtra("time", time.format(HM))
                            .putExtra("before", before);
                    PendingIntent pi = PendingIntent.getBroadcast(
                            context, code, intent,
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

                    long millis = at.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
                    if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
                        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, millis, pi);
                    } else {
                        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, millis, pi);
                    }
                    codes.add(code);
                }
            }
            saveCodes(context, codes);
        } catch (Exception ignored) {
        }
    }

    private static void cancelAll(Context context, AlarmManager am) {
        String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_CODES, "");
        if (raw == null || raw.isEmpty()) return;
        for (String part : raw.split(",")) {
            try {
                int code = Integer.parseInt(part.trim());
                Intent intent = new Intent(context, ReminderReceiver.class)
                        .setAction(ACTION + code);
                PendingIntent pi = PendingIntent.getBroadcast(
                        context, code, intent,
                        PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
                if (pi != null) am.cancel(pi);
            } catch (Exception ignored) {
            }
        }
    }

    private static void saveCodes(Context context, List<Integer> codes) {
        StringBuilder sb = new StringBuilder();
        for (Integer code : codes) {
            if (sb.length() > 0) sb.append(',');
            sb.append(code);
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString(KEY_CODES, sb.toString()).apply();
    }

    private static boolean hasWeek(JSONArray weeks, int week) {
        if (weeks == null) return false;
        for (int i = 0; i < weeks.length(); i++) {
            if (weeks.optInt(i, -1) == week) return true;
        }
        return false;
    }

    private static LocalTime parseTime(String value) {
        try {
            return LocalTime.parse(value.trim(), HM);
        } catch (Exception e) {
            return null;
        }
    }
}
