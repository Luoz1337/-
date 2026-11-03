package com.supertable.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;

public class ReminderReceiver extends BroadcastReceiver {

    private static final String CHANNEL = "class_reminder";

    @Override
    public void onReceive(Context context, Intent intent) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        createChannel(context, manager);

        String title = intent.getStringExtra("title");
        if (title == null || title.isEmpty()) title = "上课提醒";
        String room = intent.getStringExtra("room");
        String time = intent.getStringExtra("time");
        int before = intent.getIntExtra("before", 15);

        StringBuilder text = new StringBuilder();
        if (time != null && !time.isEmpty()) text.append(time);
        if (room != null && !room.isEmpty()) {
            if (text.length() > 0) text.append(" · ");
            text.append(room);
        }
        if (text.length() == 0) text.append("即将上课");
        if (before > 0) text.append("（").append(before).append(" 分钟后）");

        Intent open = new Intent(context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent content = PendingIntent.getActivity(
                context, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder = new Notification.Builder(context, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle("上课提醒 · " + title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(content)
                .setAutoCancel(true)
                .setDefaults(Notification.DEFAULT_SOUND)
                .setPriority(Notification.PRIORITY_DEFAULT);

        int id = (int) (System.currentTimeMillis() & 0x7fffffff);
        manager.notify(id, builder.build());
    }

    static void createChannel(Context context, NotificationManager manager) {
        NotificationChannel channel = new NotificationChannel(
                CHANNEL, "上课提醒", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("课程开始前的系统通知提醒");
        channel.enableVibration(true);
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), attrs);
        manager.createNotificationChannel(channel);
    }
}
