import React, { useRef } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { useRouter } from "expo-router";

export default function DoctorPortal() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <WebView
        source={{ uri: "http://10.225.244.16:5000/doctor_portal" }}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        pullToRefreshEnabled={true}

        onNavigationStateChange={(navState) => {
          console.log("URL:", navState.url);

          if (navState.url.includes("/dashboard")) {
            router.replace("/(tabs)/dashboard");
          }
        }}
      />
    </SafeAreaView>
  );
}
