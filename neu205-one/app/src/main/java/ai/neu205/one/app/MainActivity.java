package ai.neu205.one.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** One calm screen: a single Start/Stop orb, an honest state line, the last answer and its source. */
public final class MainActivity extends Activity implements Hub.View {
    private Orb orb;
    private TextView status, question, answer, cite;
    private boolean dark;
    private int fg, sub, accent, bg, card;
    private String state = "STOPPED";

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        bg = dark ? 0xFF0B1320 : 0xFFF4F6F8;
        card = dark ? 0xFF131E2E : 0xFFFFFFFF;
        fg = dark ? 0xFFE8F1F2 : 0xFF14202E;
        sub = dark ? 0xFF9FB3C2 : 0xFF51606E;
        accent = dark ? 0xFF6FD3C6 : 0xFF0F7F73;
        getWindow().getDecorView().setBackgroundColor(bg); // Android 15+ draws edge-to-edge; bars show this

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(bg);
        root.setFitsSystemWindows(true);
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        int pad = dp(20);
        col.setPadding(pad, dp(28), pad, dp(28));

        TextView title = text("NEU205", 26, fg, true);
        title.setLetterSpacing(0.12f);
        col.addView(title);
        col.addView(text("Offline neuroscience study voice", 14, sub, false));

        orb = new Orb(this);
        orb.setContentDescription("Start");
        orb.setOnClickListener(v -> toggle());
        LinearLayout.LayoutParams olp = new LinearLayout.LayoutParams(dp(220), dp(220));
        olp.topMargin = dp(40); olp.bottomMargin = dp(24);
        col.addView(orb, olp);

        status = text("Tap to start", 18, fg, false);
        status.setGravity(Gravity.CENTER);
        col.addView(status);

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(18), dp(16), dp(18), dp(16));
        GradientDrawable gd = new GradientDrawable();
        gd.setColor(card); gd.setCornerRadius(dp(18));
        box.setBackground(gd);
        question = text("", 14, sub, false);
        answer = text("Ask things like “What is the carotid sheath?” then “What does it contain?”", 17, fg, false);
        answer.setLineSpacing(0, 1.15f);
        cite = text("", 12, accent, false);
        box.addView(question); box.addView(answer); box.addView(cite);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        blp.topMargin = dp(28);
        col.addView(box, blp);

        scroll.addView(col);
        root.addView(scroll);

        TextView gear = text("⚙", 22, sub, false);
        gear.setContentDescription("Diagnostics");
        gear.setPadding(dp(16), dp(16), dp(16), dp(16));
        gear.setOnClickListener(v -> showDiagnostics());
        root.addView(gear, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.END));
        setContentView(root);

        // Pre-warm models while the user reads the screen, so Start is near-instant.
        new Thread(() -> { try { Engine.get(this); } catch (Throwable ignored) { } }, "neu205-prewarm").start();
    }

    @Override protected void onStart() { super.onStart(); Hub.attach(this); }
    @Override protected void onStop() { Hub.detach(this); super.onStop(); }

    private void toggle() {
        boolean active = !"STOPPED".equals(state) && !"ERROR".equals(state);
        if (active) { VoiceService.stop(this); orb.setActive(false); status.setText("Stopping…"); return; }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO, Manifest.permission.POST_NOTIFICATIONS}, 7);
            return;
        }
        status.setText("Starting…"); // immediate acknowledgement; "Listening" only after capture starts
        VoiceService.start(this, SystemClock.elapsedRealtime());
    }

    @Override public void onRequestPermissionsResult(int code, String[] p, int[] r) {
        if (code == 7 && r.length > 0 && r[0] == PackageManager.PERMISSION_GRANTED) toggle();
        else if (code == 7) {
            status.setText("Microphone permission is needed to listen");
            answer.setText("Tap the button again, or allow the microphone in Settings > Apps > NEU205 > Permissions.");
        }
    }

    @Override public void onState(String s, String d) {
        state = s;
        boolean active = !"STOPPED".equals(s) && !"ERROR".equals(s);
        orb.setActive(active);
        orb.setContentDescription(active ? "Stop" : "Start");
        switch (s) {
            case "PREPARING": status.setText(d.isEmpty() ? "Preparing…" : d); break;
            case "LISTENING": status.setText("Listening"); break;
            case "RECOGNIZING": status.setText("Understanding…"); break;
            case "RESOLVING": status.setText("Finding it in your book…"); break;
            case "SPEAKING": status.setText("Answering"); break;
            case "ERROR": status.setText("Needs attention: " + d); break;
            default: status.setText(d.isEmpty() ? "Tap to start" : d);
        }
        orb.setMode(s);
    }

    @Override public void onReply(String q, String a, String c, String k) {
        question.setText(q.isEmpty() ? "" : "“" + q + "”");
        answer.setText(a);
        cite.setText(c);
    }

    @Override public void onLevel(double rms, double noise, boolean speech) { orb.setLevel(rms, noise, speech); }

    @Override public void onNotice(String text) { status.setText(text); }

    private void showDiagnostics() {
        String r = Hub.report();
        TextView t = text(r, 13, fg, false);
        t.setTypeface(Typeface.MONOSPACE);
        t.setTextIsSelectable(true);
        t.setPadding(dp(20), dp(12), dp(20), dp(12));
        ScrollView sv = new ScrollView(this);
        sv.addView(t);
        new AlertDialog.Builder(this).setTitle("Diagnostics").setView(sv)
                .setPositiveButton("Copy", (d, w) -> {
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    cm.setPrimaryClip(ClipData.newPlainText("NEU205 diagnostics", r));
                })
                .setNeutralButton("Voice settings", (d, w) -> {
                    try { startActivity(new Intent("com.android.settings.TTS_SETTINGS")); }
                    catch (RuntimeException e) { startActivity(new Intent(Settings.ACTION_SETTINGS)); }
                })
                .setNegativeButton("Close", null).show();
    }

    private TextView text(String s, float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        return t;
    }

    private int dp(int v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }

    /** The single control: a calm orb; ring breathes with the live microphone level while listening. */
    final class Orb extends View {
        private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG), ring = new Paint(Paint.ANTI_ALIAS_FLAG), label = new Paint(Paint.ANTI_ALIAS_FLAG);
        private boolean active;
        private String mode = "STOPPED";
        private float level;

        Orb(Context c) {
            super(c);
            setClickable(true); setFocusable(true);
            ring.setStyle(Paint.Style.STROKE);
            label.setTextAlign(Paint.Align.CENTER);
            label.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        }

        void setActive(boolean a) { active = a; invalidate(); }
        void setMode(String m) { mode = m; invalidate(); }
        void setLevel(double rms, double noise, boolean speech) {
            float target = (float) Math.max(0, Math.min(1, (rms - noise) / 600.0));
            level = level * 0.6f + target * 0.4f;
            if ("LISTENING".equals(mode)) invalidate();
        }

        @Override protected void onDraw(Canvas cv) {
            float w = getWidth(), h = getHeight(), cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - dp(14);
            fill.setColor(active ? accent : (dark ? 0xFF1C2A3D : 0xFFE3E9EE));
            cv.drawCircle(cx, cy, r * (active ? 0.86f : 0.82f), fill);
            ring.setStrokeWidth(dp(3));
            ring.setColor(active ? Color.argb(110, Color.red(accent), Color.green(accent), Color.blue(accent)) : (dark ? 0x334FD1C1 : 0x330F7F73));
            float grow = "LISTENING".equals(mode) ? level * dp(12) : 0;
            cv.drawCircle(cx, cy, r * 0.95f + grow, ring);
            label.setColor(active ? (dark ? 0xFF0B1320 : Color.WHITE) : fg);
            label.setTextSize(r * 0.28f);
            cv.drawText(active ? "Stop" : "Start", cx, cy + r * 0.1f, label);
        }
    }
}
