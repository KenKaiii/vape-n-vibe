{
  "targets": [
    {
      "target_name": "fn_key_monitor",
      "sources": ["src/native/fn_key_monitor.mm"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "libraries": [
        "-framework Carbon",
        "-framework CoreFoundation",
        "-framework ApplicationServices"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "OTHER_CFLAGS": ["-mmacosx-version-min=10.15"],
        "CLANG_CXX_LIBRARY": "libc++"
      },
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"]
    }
  ]
}
