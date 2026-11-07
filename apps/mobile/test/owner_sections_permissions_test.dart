import 'package:flutter_test/flutter_test.dart';
import 'package:octagon_mobile/features/owner/owner_sections.dart';

/// Права разделов «Ещё» должны совпадать с backend guards.
///
/// Раньше меню требовало `trial_requests.view`, `finance.view`, `reports.view`
/// и `news.view` — таких кодов в контракте нет (заявки пишутся через дефис,
/// отчёты строятся на `payments.view`, новости читаются без права). Из-за
/// этого у STAFF разделы не появлялись никогда.
void main() {
  List<String> visibleFor(List<String> permissions) => ownerSections
      .where((section) => section.isVisible(permissions))
      .map((section) => section.id)
      .toList();

  test('без прав остаются новости и профиль', () {
    final visible = visibleFor(const []);
    expect(visible, containsAll(['news', 'profile']));
    expect(visible, isNot(contains('chats')));
    expect(visible, isNot(contains('trial_requests')));
    expect(visible, isNot(contains('attestations')));
    expect(visible, isNot(contains('reports')));
  });

  test('STAFF с заявками видит раздел заявок', () {
    // Код из контракта — `trial-requests.view` (через дефис).
    expect(visibleFor(['trial-requests.view']), contains('trial_requests'));
    expect(visibleFor(['trial-requests.manage']), contains('trial_requests'));
  });

  test('право с подчёркиванием не открывает заявки', () {
    expect(visibleFor(['trial_requests.view']), isNot(contains('trial_requests')));
  });

  test('аттестации и соревнования — по своим правам', () {
    expect(visibleFor(['attestations.view']), contains('attestations'));
    expect(visibleFor(['competitions.view']), contains('competitions'));
    expect(visibleFor(['athletes.edit']), isNot(contains('attestations')));
    expect(visibleFor(['athletes.edit']), isNot(contains('competitions')));
  });

  test('отчёты открываются правом payments.view', () {
    expect(visibleFor(['payments.view']), contains('reports'));
    expect(visibleFor(['analytics.view']), isNot(contains('reports')));
  });

  test('чаты — только с chat.use', () {
    expect(visibleFor(['chat.use']), contains('chats'));
    expect(visibleFor(['athletes.view']), isNot(contains('chats')));
  });

  test('новости не требуют отдельного права', () {
    expect(visibleFor(const []), contains('news'));
  });
}
