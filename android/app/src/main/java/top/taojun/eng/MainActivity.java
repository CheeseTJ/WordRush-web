package top.taojun.eng;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * 应用入口。
 *
 * 这里做三件事，都是为了消除「状态栏/导航栏白色」与「启动图色块」：
 *
 * 1. Android 15（API 35）起强制 edge-to-edge，系统会忽略 statusBarColor
 *    并把内容铺到状态栏下面。若不处理，WebView 的白色底会透到状态栏，
 *    而页面本身是米色，于是顶部出现一条白带。
 *    这里显式设置状态栏/导航栏为透明 + 深色图标，让页面的米色自然延伸到顶。
 *
 * 2. 用 setOnApplyWindowInsetsListener 把状态栏高度写成根容器的 padding，
 *    保证页面顶部内容不会被状态栏文字压住。前端 env(safe-area-inset-top)
 *    在 WebView 里取不到真实值，必须由原生侧补上。
 *
 * 3. 系统栏图标固定深色，因为 App 永远是浅色粘土风。
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 让内容延伸到系统栏区域（Android 15+ 本来也强制如此）
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // 系统栏必须真正透明：主题里写的 @color/brand_cream 会在窗口 attach 后
        // 重新生效，这里必须在 setContentView 之后覆盖（super.onCreate 已完成）。
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        // 去掉 windowBackground 的兜底色，避免任何缝隙露出纯色。
        // 用 null 而不是 transparent color：部分 ROM 会把 transparent 当成
        // 「不绘制」，反而回退到系统默认白。
        getWindow().setBackgroundDrawable(null);
        getWindow().getDecorView().setBackgroundColor(Color.TRANSPARENT);

        // App 固定浅色主题，系统栏图标必须是深色才看得清
        var controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(true);
        controller.setAppearanceLightNavigationBars(true);

        // WebView 铺满全屏（含状态栏/导航栏区域），让网页的渐变背景一直画到屏幕顶端。
        //
        // 安全区数值通过 CSS 变量下发给网页，由网页自己给内容留边距——
        // 给 WebView 加 padding 会让背景从状态栏下方才开始画，顶部出现纯色带。
        //
        // ⚠️ 监听器必须挂在 decorView 而不是 WebView 上，且返回原样 insets：
        // 之前挂在 WebView 上并返回 CONSUMED，会把这批 insets 消耗掉，
        // WebView 内部拿不到真实安全区（env(safe-area-inset-*) 恒为 0）。
        View webView = findViewById(R.id.webview);
        if (webView == null) {
            webView = findViewById(android.R.id.content);
        }
        final WebView target = webView instanceof WebView ? (WebView) webView : null;

        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());

            // px → CSS px（dp）：WebView 的 CSS 像素按 density 缩放
            float density = getResources().getDisplayMetrics().density;
            int top = Math.round(bars.top / density);
            int bottom = Math.round(bars.bottom / density);
            int left = Math.round(bars.left / density);
            int right = Math.round(bars.right / density);

            // 注入 CSS 变量；网页侧用 var(--safe-top) 等消费
            String js = String.format(
                    "(function(){var s=document.documentElement.style;"
                            + "s.setProperty('--safe-top','%dpx');"
                            + "s.setProperty('--safe-bottom','%dpx');"
                            + "s.setProperty('--safe-left','%dpx');"
                            + "s.setProperty('--safe-right','%dpx');"
                            + "})()",
                    top, bottom, left, right);
            if (target != null) {
                target.post(() -> target.evaluateJavascript(js, null));
            }

            // 原样返回，不消耗：让 WebView 也能拿到 insets
            return windowInsets;
        });
    }
}
