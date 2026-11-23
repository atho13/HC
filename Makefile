include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-httpcustom
PKG_VERSION:=1.1.0
PKG_RELEASE:=1

PKG_MAINTAINER:=System Architect
PKG_LICENSE:=MIT

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-httpcustom
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=HTTP Custom Multi-Protocol Tunnel
  PKGARCH:=all
  DEPENDS:=+luci-base +python3-light +stunnel +openvpn-openssl +xray-core +sshpass +openssh-client +kmod-tcp-bbr +iptables-nft +iptables-mod-ipopt +iptables-mod-conntrack-extra
endef

define Package/luci-app-httpcustom/conffiles
/etc/config/httpcustom
endef

define Build/Prepare
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/luci-app-httpcustom/install
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./root/etc/config/httpcustom $(1)/etc/config/

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./root/etc/init.d/httpcustom $(1)/etc/init.d/

	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./root/usr/bin/httpcustom_core $(1)/usr/bin/
	$(INSTALL_BIN) ./root/usr/bin/httpcustom_payload.py $(1)/usr/bin/

	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/httpcustom.json $(1)/usr/share/luci/menu.d/

	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/httpcustom
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/httpcustom/logs.js $(1)/www/luci-static/resources/view/httpcustom/
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/httpcustom/main.js $(1)/www/luci-static/resources/view/httpcustom/
endef

define Package/luci-app-httpcustom/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	rm -rf /tmp/luci-indexcache /tmp/luci-modulecache/
	/etc/init.d/rpcd reload >/dev/null 2>&1
}
exit 0
endef

$(eval $(call BuildPackage,luci-app-httpcustom))
