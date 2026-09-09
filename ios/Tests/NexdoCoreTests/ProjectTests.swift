import Foundation
import Testing
@testable import NexdoCore

@Test func projectsSearchSortingAndEmptyState() throws {
    let json = ##"[{"id":"b","name":"Café","color":"#8875ff","createdAt":"2026-01-01","updatedAt":"2026-01-02","completedTaskCount":2,"totalTaskCount":4},{"id":"a","name":"CAFE","color":"#8875ff","createdAt":"2026-01-01","updatedAt":"2026-01-02","completedTaskCount":0,"totalTaskCount":0}]"##
    let projects = try JSONDecoder().decode([NexdoProject].self, from: Data(json.utf8))
    #expect(ProjectQuery.results(projects, search: " cafe ", sort: .name).map(\.id) == ["a", "b"])
    #expect(ProjectQuery.results(projects, search: "", sort: .updated).map(\.id) == ["a", "b"])
    #expect(ProjectQuery.results(projects, search: "", sort: .completion).map(\.id) == ["b", "a"])
    #expect(ProjectQuery.results(projects, search: "", sort: .tasks).map(\.id) == ["b", "a"])
    #expect(ProjectQuery.results(projects, search: "missing", sort: .name).isEmpty)
    #expect(projects[1].progress == 0)
    #expect(!ProjectQuery.validName("  "))
    #expect(!ProjectQuery.validName(String(repeating: "a", count: 81)))
    #expect(ProjectQuery.validName(" Home "))
}
@Test func taskProjectCompatibilityAndPatchPreservation() throws {
    let json = #"{"id":"task","title":"Task","status":"PLANNED","priority":"NORMAL","durationMin":30}"#
    var task = try JSONDecoder().decode(NexdoTask.self, from: Data(json.utf8))
    #expect(task.projectId == nil)
    task.projectId = "project-a"
    let original = TaskDraft(task: task)
    var draft = original; draft.title = "Changed"
    var body = try JSONSerialization.jsonObject(with: draft.detailsBody(comparedTo: original)) as! [String: Any]
    #expect(body["projectId"] == nil)
    draft.projectId = "project-b"
    body = try JSONSerialization.jsonObject(with: draft.detailsBody(comparedTo: original)) as! [String: Any]
    #expect(body["projectId"] as? String == "project-b")
    draft.projectId = nil
    body = try JSONSerialization.jsonObject(with: draft.detailsBody(comparedTo: original)) as! [String: Any]
    #expect(body["projectId"] is NSNull)
    let input = TaskSaveInput(title: "Task", notes: "", durationMin: 30, isNew: true, projectId: "project-a")
    body = try JSONSerialization.jsonObject(with: JSONEncoder().encode(input)) as! [String: Any]
    #expect(body["projectId"] as? String == "project-a")
}
