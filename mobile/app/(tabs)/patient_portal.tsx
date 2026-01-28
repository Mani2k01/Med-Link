import React, { useRef } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { useRouter } from "expo-router";

export default function patientPortal() {
  const webRef = useRef(null);
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <WebView
        ref={webRef}
        source={{ uri: "http://10.225.244.16:5000/patient_portal" }}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        pullToRefreshEnabled={true}
        onMessage={(event) => {
          console.log("MESSAGE FROM WEB:", event.nativeEvent.data);

          const data = JSON.parse(event.nativeEvent.data);

          if (data.type === "LOGIN_SUCCESS") {
            router.replace("/(tabs)/dashboard");
          }
        }}
      />
    </SafeAreaView>
  );
}
