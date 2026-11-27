include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-frdmxtunnel
PKG_VERSION:=1.2.0
PKG_RELEASE:=1

PKG_MAINTAINER:=Frdmx-Wrt
PKG_LICENSE:=MIT

include $(INCLUDE_DIR)/package.mk

# Mapping ARCH untuk download core otomatis saat compile
ifneq ($(findstring x86_64,$(ARCH)),)
  Q_ARCH:=amd64
  Z_ARCH:=amd64
else ifneq ($(findstring aarch64,$(ARCH)),)
  Q_ARCH:=arm64
  Z_ARCH:=arm64
else ifneq ($(findstring arm,$(ARCH)),)
  Q_ARCH:=armv7
  Z_ARCH:=arm
else
  Q_ARCH:=amd64
  Z_ARCH:=amd64
endif

ZIVPN_VER:=udp-zivpn_1.4.9
QSSH_VER:=v0.1.0
ZIVPN_BASE:=https://github.com/zahidbd2/udp-zivpn/releases/download/$(ZIVPN_VER)
QSSH_BASE:=https://github.com/atho13/Q-SSH/releases/download/$(QSSH_VER)

define Package/luci-app-frdmxtunnel
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=Frdmx Tunnel Multi-Protocol Client
  DEPENDS:=+luci-base +curl +ca-bundle +python3-light +stunnel +openvpn-openssl +xray-core +sshpass +openssh-client +nftables +iptables-nft +kmod-nft-tproxy +kmod-tun +kmod-tcp-bbr
endef

define Package/luci-app-frdmxtunnel/conffiles
/etc/config/frdmxtunnel
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)/cores $(PKG_BUILD_DIR)/tmp_qssh
	curl -fL "$(ZIVPN_BASE)/udp-zivpn-linux-$(Z_ARCH)" -o $(PKG_BUILD_DIR)/cores/zivpn
	curl -fL "$(QSSH_BASE)/Q-SSH-WORKER-linux-$(Q_ARCH).zip" -o $(PKG_BUILD_DIR)/tmp_qssh/qssh.zip
	unzip -o $(PKG_BUILD_DIR)/tmp_qssh/qssh.zip -d $(PKG_BUILD_DIR)/tmp_qssh/
	mv $(PKG_BUILD_DIR)/tmp_qssh/Q-SSH-WORKER-linux-$(Q_ARCH) $(PKG_BUILD_DIR)/cores/qssh
	chmod +x $(PKG_BUILD_DIR)/cores/zivpn $(PKG_BUILD_DIR)/cores/qssh
endef


define Build/Configure
endef

define Build/Compile
endef

define Package/luci-app-frdmxtunnel/install
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./root/etc/config/frdmxtunnel $(1)/etc/config/

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./root/etc/init.d/frdmxtunnel $(1)/etc/init.d/

	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./root/usr/bin/frdmxtunnel_core $(1)/usr/bin/
	$(INSTALL_BIN) ./root/usr/bin/frdmxtunnel_payload.py $(1)/usr/bin/
	$(INSTALL_BIN) ./root/usr/bin/frdmxtunnel_stat $(1)/usr/bin/
	$(INSTALL_BIN) ./root/usr/bin/frdmxtunnel_watchdog $(1)/usr/bin/
	$(INSTALL_BIN) ./root/usr/bin/frdmxtunnel_ctrl $(1)/usr/bin/
	$(INSTALL_BIN) ./root/usr/bin/frdmxtunnel_rules.py $(1)/usr/bin/

	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/frdmxtunnel.json $(1)/usr/share/luci/menu.d/

	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-frdmxtunnel.json $(1)/usr/share/rpcd/acl.d/

	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/frdmxtunnel
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/frdmxtunnel/logs.js $(1)/www/luci-static/resources/view/frdmxtunnel/
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/frdmxtunnel/main.js $(1)/www/luci-static/resources/view/frdmxtunnel/

	$(INSTALL_DIR) $(1)/root/frdmxtunnel
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/cores/zivpn $(1)/root/frdmxtunnel/zivpn
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/cores/qssh $(1)/root/frdmxtunnel/qssh
	$(INSTALL_DATA) ./root/root/frdmxtunnel/geosite.dat $(1)/root/frdmxtunnel/geosite.dat
endef

define Package/luci-app-frdmxtunnel/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	rm -rf /tmp/luci-indexcache /tmp/luci-modulecache/
	/etc/init.d/frdmxtunnel enable >/dev/null 2>&1
	/etc/init.d/rpcd restart >/dev/null 2>&1
}
exit 0
endef

define Package/luci-app-frdmxtunnel/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	/etc/init.d/frdmxtunnel stop >/dev/null 2>&1
	/etc/init.d/frdmxtunnel disable >/dev/null 2>&1
}
exit 0
endef

$(eval $(call BuildPackage,luci-app-frdmxtunnel))
